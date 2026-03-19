use std::{
  collections::{BTreeMap, BTreeSet},
  env,
  ffi::OsStr,
  fs,
  io::{Read, Write},
  path::{Path, PathBuf},
  time::{Duration, SystemTime, UNIX_EPOCH},
};

use reqwest::Client;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tokio::{process::Command, time::timeout};
use zip::ZipArchive;

const DEFAULT_REGISTRY: &str = "https://clawhub.ai";
const DOT_DIR: &str = ".clawhub";
const LEGACY_DOT_DIR: &str = ".clawdhub";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MAX_SKILL_ARCHIVE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_SKILL_EXTRACTED_BYTES: u64 = 128 * 1024 * 1024;
const MAX_SKILL_ARCHIVE_ENTRIES: usize = 1024;
const MAX_SKILL_ENTRY_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagerConfig {
  pub workdir: Option<String>,
  pub skills_dir: Option<String>,
  pub registry: Option<String>,
  pub openclaw_path: Option<String>,
  pub connection_mode: Option<String>,
  pub gateway_url: Option<String>,
  pub gateway_token: Option<String>,
  pub docker_container: Option<String>,
  pub docker_command: Option<String>,
  pub docker_workdir: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRoot {
  pub path: String,
  pub label: String,
  pub selected: bool,
  pub exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawTarget {
  pub path: String,
  pub label: String,
  pub source: String,
  pub kind: String,
  pub exists: bool,
  pub selected: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityScanner {
  pub name: String,
  pub status: String,
  pub verdict: Option<String>,
  pub summary: Option<String>,
  pub checked_at: Option<i64>,
  pub confidence: Option<String>,
  pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkillSecurity {
  pub status: String,
  pub summary: String,
  pub checked_at: Option<i64>,
  pub has_known_issues: bool,
  pub has_scan_result: bool,
  pub reason_codes: Vec<String>,
  pub model: Option<String>,
  pub virustotal_url: Option<String>,
  pub version_context: String,
  pub source_version: Option<String>,
  pub matches_requested_version: Option<bool>,
  pub scanners: Vec<SecurityScanner>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkill {
  pub slug: String,
  pub version: Option<String>,
  pub installed_at: Option<i64>,
  pub path: String,
  pub root_label: String,
  pub registry: Option<String>,
  pub source: String,
  pub status: String,
  pub security: InstalledSkillSecurity,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagerState {
  pub resolved_workdir: String,
  pub resolved_skills_dir: String,
  pub workspace_source: String,
  pub registry: String,
  pub skill_roots: Vec<SkillRoot>,
  pub openclaw_target: Option<OpenClawTarget>,
  pub openclaw_candidates: Vec<OpenClawTarget>,
  pub installed: Vec<InstalledSkill>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrySkillCard {
  pub slug: String,
  pub display_name: String,
  pub summary: Option<String>,
  pub version: Option<String>,
  pub updated_at: Option<i64>,
  pub score: Option<f64>,
  pub downloads: Option<u64>,
  pub rating: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionOutcome {
  pub state: ManagerState,
  pub notice: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
  pub state: Option<ManagerState>,
  pub notice: String,
  pub requires_confirmation: bool,
  pub confirmation_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestOutcome {
  pub reply: String,
}

#[derive(Debug, Clone)]
struct ResolvedManagerConfig {
  workdir: PathBuf,
  skills_dir: PathBuf,
  registry: String,
  workspace_source: String,
  skill_roots: Vec<ResolvedSkillRoot>,
  openclaw_target: Option<ResolvedOpenClawTarget>,
  openclaw_candidates: Vec<ResolvedOpenClawTarget>,
  connection_mode: String,
  gateway_url: Option<String>,
  gateway_token: Option<String>,
  docker_container: Option<String>,
  docker_command: String,
  docker_workdir: Option<String>,
}

struct TemporaryConfigFile {
  path: PathBuf,
}

impl TemporaryConfigFile {
  fn path(&self) -> &Path {
    &self.path
  }
}

impl Drop for TemporaryConfigFile {
  fn drop(&mut self) {
    let _ = fs::remove_file(&self.path);
  }
}

#[derive(Debug, Clone)]
struct ResolvedSkillRoot {
  path: PathBuf,
  label: String,
  selected: bool,
  exists: bool,
}

#[derive(Debug, Clone)]
struct ResolvedOpenClawTarget {
  path: PathBuf,
  label: String,
  source: String,
  kind: String,
  exists: bool,
  selected: bool,
}

#[derive(Debug, Clone)]
enum OpenClawRunner {
  Binary(PathBuf),
  CmdScript(PathBuf),
  NodeScript { node: PathBuf, script: PathBuf },
}

impl OpenClawRunner {
  fn display(&self) -> String {
    match self {
      Self::Binary(path) | Self::CmdScript(path) => command_safe_path(path).display().to_string(),
      Self::NodeScript { node, script } => {
        format!(
          "{} {}",
          command_safe_path(node).display(),
          command_safe_path(script).display()
        )
      }
    }
  }
}

#[derive(Debug, Clone)]
struct LocalInstalledSkill {
  slug: String,
  version: Option<String>,
  installed_at: Option<i64>,
  path: PathBuf,
  root_label: String,
  registry: Option<String>,
  source: String,
  status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Lockfile {
  version: u8,
  skills: BTreeMap<String, LockEntry>,
}

impl Default for Lockfile {
  fn default() -> Self {
    Self {
      version: 1,
      skills: BTreeMap::new(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LockEntry {
  version: Option<String>,
  installed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillOrigin {
  version: u8,
  registry: String,
  slug: String,
  installed_version: String,
  installed_at: i64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeWorkspaceConfig {
  agent: Option<WorkspaceAgent>,
  agents: Option<WorkspaceAgents>,
  routing: Option<WorkspaceRouting>,
  skills: Option<WorkspaceSkillsConfig>,
}

#[derive(Debug, Default, Deserialize)]
struct WorkspaceAgent {
  workspace: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct WorkspaceAgents {
  defaults: Option<WorkspaceAgent>,
  list: Option<Vec<WorkspaceListEntry>>,
}

#[derive(Debug, Default, Deserialize)]
struct WorkspaceListEntry {
  id: Option<String>,
  name: Option<String>,
  workspace: Option<String>,
  default: Option<bool>,
}

#[derive(Debug, Default, Deserialize)]
struct WorkspaceRouting {
  agents: Option<BTreeMap<String, WorkspaceRoutingEntry>>,
}

#[derive(Debug, Default, Deserialize)]
struct WorkspaceRoutingEntry {
  name: Option<String>,
  workspace: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSkillsConfig {
  load: Option<WorkspaceSkillsLoad>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSkillsLoad {
  extra_dirs: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchResponse {
  results: Vec<SearchResponseItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchResponseItem {
  slug: Option<String>,
  display_name: Option<String>,
  summary: Option<String>,
  version: Option<String>,
  score: f64,
  updated_at: Option<i64>,
  #[serde(default, alias = "downloadCount", alias = "download_count", alias = "installs")]
  downloads: Option<u64>,
  #[serde(default, alias = "averageRating", alias = "average_rating")]
  rating: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowseResponse {
  items: Vec<BrowseResponseItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowseResponseItem {
  slug: String,
  display_name: String,
  summary: Option<String>,
  updated_at: i64,
  latest_version: Option<BrowseVersion>,
  #[serde(default, alias = "downloadCount", alias = "download_count", alias = "installs")]
  downloads: Option<u64>,
  #[serde(default, alias = "averageRating", alias = "average_rating")]
  rating: Option<f64>,
  #[serde(default)]
  score: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct BrowseVersion {
  version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillMetaResponse {
  latest_version: Option<BrowseVersion>,
  moderation: Option<ModerationState>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModerationState {
  is_suspicious: bool,
  is_malware_blocked: bool,
  summary: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillScanResponse {
  version: Option<ScanVersionRef>,
  moderation: Option<ScanModeration>,
  security: Option<ScanSecurity>,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanVersionRef {
  version: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanModeration {
  source_version: Option<ScanVersionRef>,
  matches_requested_version: Option<bool>,
  is_pending_scan: Option<bool>,
  is_malware_blocked: Option<bool>,
  is_suspicious: Option<bool>,
  is_hidden_by_mod: Option<bool>,
  is_removed: Option<bool>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanSecurity {
  status: Option<String>,
  has_warnings: Option<bool>,
  checked_at: Option<i64>,
  model: Option<String>,
  has_scan_result: Option<bool>,
  virustotal_url: Option<String>,
  scanners: Option<ScanSecurityScanners>,
}

#[derive(Debug, Default, Deserialize)]
struct ScanSecurityScanners {
  vt: Option<ScanVtScanner>,
  llm: Option<ScanLlmScanner>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanVtScanner {
  status: Option<String>,
  verdict: Option<String>,
  normalized_status: Option<String>,
  analysis: Option<String>,
  source: Option<String>,
  checked_at: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanLlmScanner {
  status: Option<String>,
  verdict: Option<String>,
  normalized_status: Option<String>,
  confidence: Option<String>,
  summary: Option<String>,
  guidance: Option<String>,
  model: Option<String>,
  checked_at: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModerationDetailResponse {
  moderation: Option<ModerationDetail>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModerationDetail {
  is_suspicious: bool,
  is_malware_blocked: bool,
  verdict: Option<String>,
  reason_codes: Option<Vec<String>>,
  summary: Option<String>,
}

#[tauri::command]
pub async fn load_manager_state(config: Option<ManagerConfig>) -> Result<ManagerState, String> {
  let resolved = resolve_manager_config(config)?;
  build_manager_state(&resolved).await
}

#[tauri::command]
pub async fn browse_registry_skills(
  config: Option<ManagerConfig>,
  limit: Option<u32>,
  sort: Option<String>,
) -> Result<Vec<RegistrySkillCard>, String> {
  let resolved = resolve_manager_config(config)?;
  let client = build_client()?;
  let mut request = client
    .get(format!("{}/api/v1/skills", resolved.registry.trim_end_matches('/')))
    .query(&[("limit", clamp_limit(limit).to_string())]);

  if let Some(api_sort) = normalize_sort(sort.as_deref()) {
    request = request.query(&[("sort", api_sort)]);
  }

  let response = request.send().await.map_err(|error| error.to_string())?;
  if !response.status().is_success() {
    return Err(read_response_error(response).await);
  }

  let payload = response
    .json::<BrowseResponse>()
    .await
    .map_err(|error| error.to_string())?;

  Ok(
    payload
      .items
      .into_iter()
      .map(|item| RegistrySkillCard {
        slug: item.slug,
        display_name: item.display_name,
        summary: item.summary,
        version: item.latest_version.map(|version| version.version),
        updated_at: Some(item.updated_at),
        score: item.score,
        downloads: item.downloads,
        rating: item.rating,
      })
      .collect(),
  )
}

#[tauri::command]
pub async fn search_registry_skills(
  config: Option<ManagerConfig>,
  query: String,
  limit: Option<u32>,
) -> Result<Vec<RegistrySkillCard>, String> {
  let trimmed_query = query.trim();
  if trimmed_query.is_empty() {
    return Err("Query required".to_string());
  }

  let resolved = resolve_manager_config(config)?;
  let client = build_client()?;
  let response = client
    .get(format!("{}/api/v1/search", resolved.registry.trim_end_matches('/')))
    .query(&[
      ("limit", clamp_limit(limit).to_string()),
      ("q", trimmed_query.to_string()),
    ])
    .send()
    .await
    .map_err(|error| error.to_string())?;

  if !response.status().is_success() {
    return Err(read_response_error(response).await);
  }

  let payload = response
    .json::<SearchResponse>()
    .await
    .map_err(|error| error.to_string())?;

  Ok(
    payload
      .results
      .into_iter()
      .filter_map(|item| {
        let slug = item.slug?;
        let display_name = item.display_name.unwrap_or_else(|| slug.clone());
        Some(RegistrySkillCard {
          slug,
          display_name,
          summary: item.summary,
          version: item.version,
          updated_at: item.updated_at,
          score: Some(item.score),
          downloads: item.downloads,
          rating: item.rating,
        })
      })
      .collect(),
  )
}

#[tauri::command]
pub async fn install_registry_skill(
  config: Option<ManagerConfig>,
  slug: String,
  version: Option<String>,
  force: Option<bool>,
) -> Result<InstallOutcome, String> {
  let resolved = resolve_manager_config(config.clone())?;
  let safe_slug = sanitize_slug(&slug)?;
  let allow_force = force.unwrap_or(false);
  let client = build_client()?;

  let meta_response = client
    .get(format!(
      "{}/api/v1/skills/{}",
      resolved.registry.trim_end_matches('/'),
      safe_slug
    ))
    .send()
    .await
    .map_err(|error| error.to_string())?;

  if !meta_response.status().is_success() {
    return Err(read_response_error(meta_response).await);
  }

  let meta = meta_response
    .json::<SkillMetaResponse>()
    .await
    .map_err(|error| error.to_string())?;

  if let Some(moderation) = meta.moderation {
    if moderation.is_malware_blocked {
      return Err(format!("{safe_slug} is blocked because it was flagged as malicious."));
    }

    if moderation.is_suspicious && !allow_force {
      return Ok(InstallOutcome {
        state: None,
        notice: format!("{safe_slug} requires confirmation before installing."),
        requires_confirmation: true,
        confirmation_reason: Some(
          moderation
            .summary
            .unwrap_or_else(|| "This skill was flagged as suspicious by registry scanning.".to_string()),
        ),
      });
    }
  }

  let resolved_version = version
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string)
    .or_else(|| meta.latest_version.map(|item| item.version))
    .ok_or_else(|| format!("Could not resolve a version for {safe_slug}."))?;

  fs::create_dir_all(&resolved.skills_dir).map_err(|error| error.to_string())?;

  let target_dir = resolved.skills_dir.join(&safe_slug);
  if target_dir.exists() && !allow_force {
    return Err(format!(
      "{} already exists. Remove it first or retry with force.",
      target_dir.display()
    ));
  }

  let mut download_response = client
    .get(format!("{}/api/v1/download", resolved.registry.trim_end_matches('/')))
    .query(&[
      ("slug", safe_slug.clone()),
      ("version", resolved_version.clone()),
    ])
    .send()
    .await
    .map_err(|error| error.to_string())?;

  if !download_response.status().is_success() {
    return Err(read_response_error(download_response).await);
  }

  let staging_dir = resolved
    .skills_dir
    .join(format!(".install-{}-{}", safe_slug, current_time_ms()));
  let archive_path = resolved
    .skills_dir
    .join(format!(".download-{}-{}.zip", safe_slug, current_time_ms()));

  if staging_dir.exists() {
    remove_path(&staging_dir)?;
  }

  if archive_path.exists() {
    remove_path(&archive_path)?;
  }

  fs::create_dir_all(&staging_dir).map_err(|error| error.to_string())?;

  if let Err(error) = download_response_to_file(&mut download_response, &archive_path).await {
    let _ = remove_path(&staging_dir);
    let _ = remove_path(&archive_path);
    return Err(error);
  }

  let extraction_result = extract_zip_archive(&archive_path, &staging_dir);
  let _ = remove_path(&archive_path);
  if let Err(error) = extraction_result {
    let _ = remove_path(&staging_dir);
    return Err(error);
  }

  write_skill_origin(
    &staging_dir,
    &SkillOrigin {
      version: 1,
      registry: resolved.registry.clone(),
      slug: safe_slug.clone(),
      installed_version: resolved_version.clone(),
      installed_at: current_time_ms(),
    },
  )?;

  if target_dir.exists() {
    remove_path(&target_dir)?;
  }

  fs::rename(&staging_dir, &target_dir).map_err(|error| error.to_string())?;

  let mut lockfile = read_lockfile(&resolved.workdir);
  lockfile.skills.insert(
    safe_slug.clone(),
    LockEntry {
      version: Some(resolved_version.clone()),
      installed_at: current_time_ms(),
    },
  );
  write_lockfile(&resolved.workdir, &lockfile)?;

  Ok(InstallOutcome {
    state: Some(build_manager_state(&resolved).await?),
    notice: format!("Installed {safe_slug} v{resolved_version} into {}", target_dir.display()),
    requires_confirmation: false,
    confirmation_reason: None,
  })
}

#[tauri::command]
pub async fn uninstall_registry_skill(
  config: Option<ManagerConfig>,
  slug: String,
  path: Option<String>,
) -> Result<ActionOutcome, String> {
  let resolved = resolve_manager_config(config)?;
  let safe_slug = sanitize_slug(&slug)?;
  let target_dir = resolve_uninstall_target(&resolved, &safe_slug, path)?;
  let default_target = normalized_path(&resolved.skills_dir.join(&safe_slug));

  if target_dir.exists() {
    remove_path(&target_dir)?;
  }

  if path_key(&target_dir) == path_key(&default_target) {
    let mut lockfile = read_lockfile(&resolved.workdir);
    lockfile.skills.remove(&safe_slug);
    write_lockfile(&resolved.workdir, &lockfile)?;
  }

  Ok(ActionOutcome {
    state: build_manager_state(&resolved).await?,
    notice: format!("Removed {safe_slug} from {}", target_dir.display()),
  })
}

#[tauri::command]
pub async fn send_openclaw_prompt(
  config: Option<ManagerConfig>,
  prompt: String,
) -> Result<QuestOutcome, String> {
  let resolved = resolve_manager_config(config)?;
  let trimmed_prompt = prompt.trim();
  if trimmed_prompt.is_empty() {
    return Err("Enter a quest prompt first.".to_string());
  }

  match resolved.connection_mode.as_str() {
    "remote" => send_prompt_via_remote_gateway(&resolved, trimmed_prompt).await,
    "docker" => send_prompt_via_docker(&resolved, trimmed_prompt).await,
    _ => send_prompt_via_local_runner(&resolved, trimmed_prompt, &[]).await,
  }
}

async fn send_prompt_via_local_runner(
  resolved: &ResolvedManagerConfig,
  prompt: &str,
  extra_env: &[(String, String)],
) -> Result<QuestOutcome, String> {
  let runners = resolve_openclaw_runners(&resolved);
  if runners.is_empty() {
    let message = if resolved.connection_mode == "remote" {
      "Remote Gateway mode still needs an OpenClaw CLI on this machine. Install the CLI locally or switch to Docker mode."
    } else {
      "Could not find an OpenClaw command for this build. Set a valid build path or make sure the OpenClaw CLI is installed."
    };
    return Err(message.to_string());
  }

  let command_workdir = resolve_command_workdir(&resolved.workdir);
  let runner = select_gateway_runner(&command_workdir, &runners, extra_env).await?;
  let agent_id = detect_default_agent_id().unwrap_or_else(|| "main".to_string());

  let mut command = build_openclaw_command(&runner);
  apply_command_env(&mut command, extra_env);

  command
    .kill_on_drop(true)
    .current_dir(&command_workdir)
    .arg("agent")
    .arg("--agent")
    .arg(&agent_id)
    .arg("--message")
    .arg(prompt)
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped());

  let output = run_command_output(
    &mut command,
    Duration::from_secs(120),
    "OpenClaw did not respond within 120 seconds.",
    &format!("Could not launch the OpenClaw command from {}.", command_workdir.display()),
  )
  .await?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() {
      stderr
    } else if !stdout.is_empty() {
      stdout
    } else {
      format!("OpenClaw exited with status {:?}", output.status.code())
    };
    return Err(detail);
  }

  let reply = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if reply.is_empty() {
    return Err("OpenClaw returned no response.".to_string());
  }

  Ok(QuestOutcome {
    reply,
  })
}

async fn send_prompt_via_remote_gateway(
  resolved: &ResolvedManagerConfig,
  prompt: &str,
) -> Result<QuestOutcome, String> {
  let temp_config_path = write_remote_gateway_temp_config(resolved)?;
  let env = vec![(
    "OPENCLAW_CONFIG_PATH".to_string(),
    temp_config_path.path().display().to_string(),
  )];
  send_prompt_via_local_runner(resolved, prompt, &env).await
}

async fn send_prompt_via_docker(
  resolved: &ResolvedManagerConfig,
  prompt: &str,
) -> Result<QuestOutcome, String> {
  let container = resolved
    .docker_container
    .clone()
    .ok_or_else(|| "Enter a Docker container name first.".to_string())?;
  let agent_id = detect_default_agent_id().unwrap_or_else(|| "main".to_string());

  let mut health_command = build_docker_exec_command(resolved, &["gateway", "health"])?;
  let health_output = run_command_output(
    &mut health_command,
    Duration::from_secs(10),
    "Could not reach the Docker OpenClaw Gateway. Start the container and try again.",
    &format!("Could not launch docker exec for container {container}."),
  )
  .await?;
  if !health_output.status.success() {
    let detail = command_output_detail(&health_output);
    return if detail.is_empty() {
      Err(format!(
        "No running OpenClaw Gateway was found inside Docker container {container}. Start it and try again."
      ))
    } else {
      Err(format!(
        "No running OpenClaw Gateway was found inside Docker container {container}. Start it and try again.\n\n{detail}"
      ))
    };
  }

  let mut command = build_docker_exec_command(
    resolved,
    &["agent", "--agent", &agent_id, "--message", prompt],
  )?;
  let output = run_command_output(
    &mut command,
    Duration::from_secs(120),
    "OpenClaw did not respond within 120 seconds.",
    &format!("Could not launch docker exec for container {container}."),
  )
  .await?;
  if !output.status.success() {
    let detail = command_output_detail(&output);
    return Err(if detail.is_empty() {
      "OpenClaw returned no response.".to_string()
    } else {
      detail
    });
  }

  let reply = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if reply.is_empty() {
    return Err("OpenClaw returned no response.".to_string());
  }

  Ok(QuestOutcome {
    reply,
  })
}

async fn ensure_gateway_running(
  workdir: &Path,
  runner: &OpenClawRunner,
  extra_env: &[(String, String)],
) -> Result<(), String> {
  let command_workdir = resolve_command_workdir(workdir);
  let mut command = build_openclaw_command(runner);
  apply_command_env(&mut command, extra_env);
  command
    .kill_on_drop(true)
    .current_dir(&command_workdir)
    .arg("gateway")
    .arg("health")
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped());

  let output = run_command_output(
    &mut command,
    Duration::from_secs(10),
    "Could not reach the saved OpenClaw Gateway. Start it and try again.",
    &format!(
      "Could not launch the OpenClaw command for the saved build from {}.",
      command_workdir.display()
    ),
  )
  .await?;

  if output.status.success() {
    return Ok(());
  }

  let detail = command_output_detail(&output);
  if detail.is_empty() {
    Err("No running OpenClaw Gateway found for the saved build. Start it and try again.".to_string())
  } else {
    Err(format!(
      "No running OpenClaw Gateway found for the saved build. Start it and try again.\n\n{detail}"
    ))
  }
}

async fn select_gateway_runner(
  workdir: &Path,
  runners: &[OpenClawRunner],
  extra_env: &[(String, String)],
) -> Result<OpenClawRunner, String> {
  let mut failures = Vec::new();

  for runner in runners {
    match ensure_gateway_running(workdir, runner, extra_env).await {
      Ok(()) => return Ok(runner.clone()),
      Err(error) => failures.push((runner.display(), error)),
    }
  }

  let mut detail = String::new();
  for (runner, error) in failures.iter().take(4) {
    if !detail.is_empty() {
      detail.push('\n');
    }

    detail.push_str("- ");
    detail.push_str(runner);
    detail.push_str(": ");
    detail.push_str(error.lines().next().unwrap_or(error));
  }

  if detail.is_empty() {
    Err("No running OpenClaw Gateway found for the saved build. Start it and try again.".to_string())
  } else {
    Err(format!(
      "No running OpenClaw Gateway found for the saved build. Start it and try again.\n\nTried:\n{detail}"
    ))
  }
}

async fn build_manager_state(config: &ResolvedManagerConfig) -> Result<ManagerState, String> {
  Ok(ManagerState {
    resolved_workdir: config.workdir.display().to_string(),
    resolved_skills_dir: config.skills_dir.display().to_string(),
    workspace_source: config.workspace_source.clone(),
    registry: config.registry.clone(),
    skill_roots: config
      .skill_roots
      .iter()
      .map(|root| SkillRoot {
        path: root.path.display().to_string(),
        label: root.label.clone(),
        selected: root.selected,
        exists: root.exists,
      })
      .collect(),
    openclaw_target: config.openclaw_target.as_ref().map(|item| OpenClawTarget {
      path: item.path.display().to_string(),
      label: item.label.clone(),
      source: item.source.clone(),
      kind: item.kind.clone(),
      exists: item.exists,
      selected: item.selected,
    }),
    openclaw_candidates: config
      .openclaw_candidates
      .iter()
      .map(|item| OpenClawTarget {
        path: item.path.display().to_string(),
        label: item.label.clone(),
        source: item.source.clone(),
        kind: item.kind.clone(),
        exists: item.exists,
        selected: item.selected,
      })
      .collect(),
    installed: list_installed_skills(config).await?,
  })
}

fn resolve_manager_config(config: Option<ManagerConfig>) -> Result<ResolvedManagerConfig, String> {
  let (detected_workdir, workspace_source) = detect_default_workdir();
  let resolved_workdir =
    if let Some(raw) = clean_string(config.as_ref().and_then(|item| item.workdir.as_ref())) {
      resolve_input_path(&raw, None)
    } else {
      detected_workdir
    };

  let resolved_skills_dir =
    if let Some(raw) = clean_string(config.as_ref().and_then(|item| item.skills_dir.as_ref())) {
      resolve_input_path(&raw, Some(&resolved_workdir))
    } else {
      resolved_workdir.join("skills")
    };

  let registry = clean_string(config.as_ref().and_then(|item| item.registry.as_ref()))
    .unwrap_or_else(|| DEFAULT_REGISTRY.to_string());

  let skill_roots = collect_skill_roots(&resolved_workdir, &resolved_skills_dir);
  let (openclaw_target, openclaw_candidates) =
    detect_openclaw_targets(config.as_ref(), &resolved_workdir, &resolved_skills_dir);
  let connection_mode = normalize_connection_mode(
    config
      .as_ref()
      .and_then(|item| item.connection_mode.as_deref())
      .unwrap_or("local"),
  );
  let gateway_url = clean_string(config.as_ref().and_then(|item| item.gateway_url.as_ref()));
  let gateway_token = clean_string(config.as_ref().and_then(|item| item.gateway_token.as_ref()));
  let docker_container = clean_string(config.as_ref().and_then(|item| item.docker_container.as_ref()));
  let docker_command = clean_string(config.as_ref().and_then(|item| item.docker_command.as_ref()))
    .unwrap_or_else(|| "openclaw".to_string());
  let docker_workdir = clean_string(config.as_ref().and_then(|item| item.docker_workdir.as_ref()));

  Ok(ResolvedManagerConfig {
    workdir: normalized_path(&resolved_workdir),
    skills_dir: normalized_path(&resolved_skills_dir),
    registry,
    workspace_source,
    skill_roots,
    openclaw_target,
    openclaw_candidates,
    connection_mode,
    gateway_url,
    gateway_token,
    docker_container,
    docker_command,
    docker_workdir,
  })
}

async fn list_installed_skills(config: &ResolvedManagerConfig) -> Result<Vec<InstalledSkill>, String> {
  let local_items = collect_local_installed_skills(config)?;
  let client = build_client()?;
  let mut installed = Vec::with_capacity(local_items.len());

  for item in local_items {
    let security = fetch_installed_skill_security(&client, &item, &config.registry).await;
    installed.push(InstalledSkill {
      slug: item.slug,
      version: item.version,
      installed_at: item.installed_at,
      path: item.path.display().to_string(),
      root_label: item.root_label,
      registry: item.registry,
      source: item.source,
      status: item.status,
      security,
    });
  }

  Ok(installed)
}

fn collect_local_installed_skills(
  config: &ResolvedManagerConfig,
) -> Result<Vec<LocalInstalledSkill>, String> {
  let lockfile = read_lockfile(&config.workdir);
  let selected_root_label = config
    .skill_roots
    .iter()
    .find(|root| root.selected)
    .map(|root| root.label.clone())
    .unwrap_or_else(|| "Install target".to_string());

  let mut items = Vec::new();
  let mut seen_paths = BTreeSet::new();

  for (slug, entry) in lockfile.skills {
    let path = normalized_path(&config.skills_dir.join(&slug));
    seen_paths.insert(path_key(&path));
    let origin = read_skill_origin(&path);
    let exists = path.is_dir();
    items.push(LocalInstalledSkill {
      slug,
      version: origin
        .as_ref()
        .map(|item| item.installed_version.clone())
        .or(entry.version),
      installed_at: origin
        .as_ref()
        .map(|item| item.installed_at)
        .or(Some(entry.installed_at)),
      path,
      root_label: selected_root_label.clone(),
      registry: origin.as_ref().map(|item| item.registry.clone()),
      source: if origin.is_some() {
        "origin".to_string()
      } else {
        "lockfile".to_string()
      },
      status: if exists {
        "ready".to_string()
      } else {
        "missing".to_string()
      },
    });
  }

  for root in &config.skill_roots {
    if !root.path.is_dir() {
      continue;
    }

    for entry in fs::read_dir(&root.path).map_err(|error| error.to_string())? {
      let entry = entry.map_err(|error| error.to_string())?;
      let file_type = entry.file_type().map_err(|error| error.to_string())?;
      if !file_type.is_dir() {
        continue;
      }

      let slug = entry.file_name().to_string_lossy().to_string();
      if slug.starts_with('.') || !is_safe_slug(&slug) {
        continue;
      }

      let path = normalized_path(&entry.path());
      if !seen_paths.insert(path_key(&path)) {
        continue;
      }

      let origin = read_skill_origin(&path);
      items.push(LocalInstalledSkill {
        slug,
        version: origin.as_ref().map(|item| item.installed_version.clone()),
        installed_at: origin.as_ref().map(|item| item.installed_at),
        path,
        root_label: root.label.clone(),
        registry: origin.as_ref().map(|item| item.registry.clone()),
        source: if origin.is_some() {
          "origin".to_string()
        } else {
          "scan".to_string()
        },
        status: "ready".to_string(),
      });
    }
  }

  items.sort_by(|left, right| {
    right
      .installed_at
      .unwrap_or_default()
      .cmp(&left.installed_at.unwrap_or_default())
      .then_with(|| left.slug.cmp(&right.slug))
      .then_with(|| left.path.cmp(&right.path))
  });

  Ok(items)
}

async fn fetch_installed_skill_security(
  client: &Client,
  item: &LocalInstalledSkill,
  fallback_registry: &str,
) -> InstalledSkillSecurity {
  let safe_slug = match sanitize_slug(&item.slug) {
    Ok(value) => value,
    Err(_) => {
      return unknown_security(
        "The skill folder name is not a valid registry slug, so registry checks were skipped.",
        version_context_for_item(item),
      );
    }
  };

  let registry = item
    .registry
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or(fallback_registry)
    .trim_end_matches('/')
    .to_string();

  if registry.is_empty() {
    return unknown_security(
      "No registry is configured for this install, so no security lookup was possible.",
      version_context_for_item(item),
    );
  }

  let mut request = client.get(format!("{registry}/api/v1/skills/{safe_slug}/scan"));
  if let Some(version) = item.version.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
    request = request.query(&[("version", version.to_string())]);
  }

  let response = match request.send().await {
    Ok(response) => response,
    Err(error) => {
      return error_security(
        format!("Could not reach the registry security endpoint: {error}"),
        version_context_for_item(item),
      );
    }
  };

  if response.status() == reqwest::StatusCode::NOT_FOUND {
    return unknown_security(
      "No public registry scan record was found for this skill.",
      version_context_for_item(item),
    );
  }

  if !response.status().is_success() {
    return error_security(
      read_response_error(response).await,
      version_context_for_item(item),
    );
  }

  let payload = match response.json::<SkillScanResponse>().await {
    Ok(payload) => payload,
    Err(error) => {
      return error_security(
        format!("The registry returned an unreadable security payload: {error}"),
        version_context_for_item(item),
      );
    }
  };

  let mut reason_codes = Vec::new();
  let mut moderation_summary = None;
  let mut status = normalize_security_status(
    payload.security.as_ref().and_then(|item| item.status.as_deref()),
  );

  if let Some(moderation) = payload.moderation.as_ref() {
    if moderation.is_malware_blocked.unwrap_or(false) || moderation.is_removed.unwrap_or(false) {
      status = "malicious".to_string();
    } else if moderation.is_suspicious.unwrap_or(false) || moderation.is_hidden_by_mod.unwrap_or(false) {
      if status != "malicious" {
        status = "suspicious".to_string();
      }
    }

    if status == "unknown" && moderation.is_pending_scan.unwrap_or(false) {
      status = "pending".to_string();
    }
  }

  if matches!(status.as_str(), "suspicious" | "malicious") {
    if let Some(details) = fetch_moderation_details(client, &registry, &safe_slug).await {
      if details.is_malware_blocked {
        status = "malicious".to_string();
      } else if details.is_suspicious && status != "malicious" {
        status = "suspicious".to_string();
      }
      moderation_summary = clean_string(details.summary.as_ref());
      reason_codes = details.reason_codes.unwrap_or_default();
      if status == "unknown" {
        status = normalize_security_status(details.verdict.as_deref());
      }
    }
  }

  let source_version = payload
    .moderation
    .as_ref()
    .and_then(|item| item.source_version.as_ref())
    .and_then(|item| item.version.clone());
  let has_scan_result = payload
    .security
    .as_ref()
    .and_then(|item| item.has_scan_result)
    .unwrap_or(false);
  let has_security_warnings = payload
    .security
    .as_ref()
    .and_then(|item| item.has_warnings)
    .unwrap_or(false);

  let summary = build_security_summary(
    &status,
    item,
    payload.version.as_ref().and_then(|value| value.version.as_deref()),
    moderation_summary.as_deref(),
    payload.moderation.as_ref(),
  );

  InstalledSkillSecurity {
    status: status.clone(),
    summary,
    checked_at: payload.security.as_ref().and_then(|item| item.checked_at),
    has_known_issues: matches!(status.as_str(), "suspicious" | "malicious") || has_security_warnings,
    has_scan_result,
    reason_codes,
    model: payload.security.as_ref().and_then(|item| item.model.clone()),
    virustotal_url: payload
      .security
      .as_ref()
      .and_then(|item| item.virustotal_url.clone()),
    version_context: version_context_for_item(item).to_string(),
    source_version,
    matches_requested_version: payload
      .moderation
      .as_ref()
      .and_then(|item| item.matches_requested_version),
    scanners: build_security_scanners(payload.security.as_ref()),
  }
}

async fn fetch_moderation_details(
  client: &Client,
  registry: &str,
  slug: &str,
) -> Option<ModerationDetail> {
  let response = client
    .get(format!("{registry}/api/v1/skills/{slug}/moderation"))
    .send()
    .await
    .ok()?;

  if !response.status().is_success() {
    return None;
  }

  response
    .json::<ModerationDetailResponse>()
    .await
    .ok()?
    .moderation
}

fn build_security_scanners(security: Option<&ScanSecurity>) -> Vec<SecurityScanner> {
  let mut scanners = Vec::new();

  if let Some(vt) = security
    .and_then(|item| item.scanners.as_ref())
    .and_then(|item| item.vt.as_ref())
  {
    scanners.push(SecurityScanner {
      name: "VirusTotal".to_string(),
      status: normalize_security_status(
        vt.normalized_status
          .as_deref()
          .or(vt.verdict.as_deref())
          .or(vt.status.as_deref()),
      ),
      verdict: vt.verdict.clone(),
      summary: vt.analysis.clone(),
      checked_at: vt.checked_at,
      confidence: None,
      source: vt.source.clone(),
    });
  }

  if let Some(llm) = security
    .and_then(|item| item.scanners.as_ref())
    .and_then(|item| item.llm.as_ref())
  {
    scanners.push(SecurityScanner {
      name: "OpenClaw AI".to_string(),
      status: normalize_security_status(
        llm.normalized_status
          .as_deref()
          .or(llm.verdict.as_deref())
          .or(llm.status.as_deref()),
      ),
      verdict: llm.verdict.clone(),
      summary: llm.summary.clone().or(llm.guidance.clone()),
      checked_at: llm.checked_at,
      confidence: llm.confidence.clone(),
      source: llm.model.clone(),
    });
  }

  scanners
}

fn build_security_summary(
  status: &str,
  item: &LocalInstalledSkill,
  resolved_version: Option<&str>,
  moderation_summary: Option<&str>,
  moderation: Option<&ScanModeration>,
) -> String {
  if let Some(summary) = moderation_summary.map(str::trim).filter(|value| !value.is_empty()) {
    if item.version.is_none() {
      return format!("{summary} Installed version is unknown, so this is based on the latest registry record.");
    }

    if let Some(false) = moderation.and_then(|item| item.matches_requested_version) {
      if let Some(source_version) = moderation
        .and_then(|item| item.source_version.as_ref())
        .and_then(|item| item.version.as_deref())
      {
        return format!(
          "{summary} Registry moderation is attached to v{source_version}, so review the version mismatch before trusting the installed copy."
        );
      }
    }

    return summary.to_string();
  }

  match status {
    "malicious" => {
      "Registry moderation marked this skill as malicious. Remove it unless you explicitly trust the source."
        .to_string()
    }
    "suspicious" => {
      if let Some(false) = moderation.and_then(|item| item.matches_requested_version) {
        if let Some(source_version) = moderation
          .and_then(|item| item.source_version.as_ref())
          .and_then(|item| item.version.as_deref())
        {
          return format!(
            "The latest registry moderation warning is attached to v{source_version}. Your installed version may differ, so review it before keeping it active."
          );
        }
      }

      if let Some(version) = resolved_version.or(item.version.as_deref()) {
        return format!("Registry scanners flagged {} v{} for review.", item.slug, version);
      }

      if item.version.is_none() {
        return format!(
          "Installed version is unknown, so the latest registry warning for {} is shown here.",
          item.slug
        );
      }

      "Registry scanners flagged this skill for review.".to_string()
    }
    "clean" => {
      if item.version.is_none() {
        format!(
          "Installed version is unknown; the latest public registry record for {} currently looks clean.",
          item.slug
        )
      } else {
        match resolved_version.or(item.version.as_deref()) {
          Some(version) => format!("No known registry issues were found for {} v{}.", item.slug, version),
          None => format!("No known registry issues were found for {}.", item.slug),
        }
      }
    }
    "pending" => {
      "Registry security analysis has not produced a final verdict for this skill yet.".to_string()
    }
    "error" => {
      "The manager could not confirm a registry security verdict for this skill.".to_string()
    }
    _ => {
      if item.version.is_none() {
        "This skill is installed locally, but its exact registry version could not be confirmed."
          .to_string()
      } else {
        "This skill has local metadata, but the registry did not return a matching scan record."
          .to_string()
      }
    }
  }
}

fn version_context_for_item(item: &LocalInstalledSkill) -> &'static str {
  if item
    .version
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .is_some()
  {
    "installed"
  } else {
    "latest"
  }
}

fn unknown_security(summary: impl Into<String>, version_context: &str) -> InstalledSkillSecurity {
  InstalledSkillSecurity {
    status: "unknown".to_string(),
    summary: summary.into(),
    checked_at: None,
    has_known_issues: false,
    has_scan_result: false,
    reason_codes: Vec::new(),
    model: None,
    virustotal_url: None,
    version_context: version_context.to_string(),
    source_version: None,
    matches_requested_version: None,
    scanners: Vec::new(),
  }
}

fn error_security(summary: impl Into<String>, version_context: &str) -> InstalledSkillSecurity {
  InstalledSkillSecurity {
    status: "error".to_string(),
    summary: summary.into(),
    checked_at: None,
    has_known_issues: false,
    has_scan_result: false,
    reason_codes: Vec::new(),
    model: None,
    virustotal_url: None,
    version_context: version_context.to_string(),
    source_version: None,
    matches_requested_version: None,
    scanners: Vec::new(),
  }
}

fn normalize_security_status(raw: Option<&str>) -> String {
  match raw.unwrap_or("unknown").trim().to_ascii_lowercase().as_str() {
    "benign" | "clean" => "clean".to_string(),
    "suspicious" => "suspicious".to_string(),
    "malicious" => "malicious".to_string(),
    "pending" | "loading" | "not_found" | "not-found" | "stale" => "pending".to_string(),
    "error" | "failed" => "error".to_string(),
    _ => "unknown".to_string(),
  }
}

fn resolve_uninstall_target(
  config: &ResolvedManagerConfig,
  slug: &str,
  path: Option<String>,
) -> Result<PathBuf, String> {
  let default_target = normalized_path(&config.skills_dir.join(slug));
  let Some(raw_path) = path.and_then(|value| {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() { None } else { Some(trimmed) }
  }) else {
    return Ok(default_target);
  };

  let target = normalized_path(&resolve_input_path(&raw_path, None));
  let file_name = target
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or_default()
    .trim()
    .to_string();

  if file_name != slug {
    return Err("The selected uninstall target does not match the skill slug.".to_string());
  }

  let is_allowed = config
    .skill_roots
    .iter()
    .any(|root| target.starts_with(&root.path))
    || target.starts_with(&config.skills_dir);

  if !is_allowed {
    return Err("Refusing to remove a folder outside the detected skill roots.".to_string());
  }

  Ok(target)
}

fn collect_skill_roots(workdir: &Path, selected_skills_dir: &Path) -> Vec<ResolvedSkillRoot> {
  let mut roots = Vec::new();
  let mut seen = BTreeSet::new();

  push_skill_root(
    &mut roots,
    &mut seen,
    selected_skills_dir.to_path_buf(),
    "Install target".to_string(),
    true,
  );

  let clawdbot_state_dir = clawdbot_state_dir();
  push_skill_root(
    &mut roots,
    &mut seen,
    clawdbot_state_dir.join("skills"),
    "Shared skills".to_string(),
    false,
  );

  let openclaw_state_dir = openclaw_state_dir();
  push_skill_root(
    &mut roots,
    &mut seen,
    openclaw_state_dir.join("skills"),
    "OpenClaw: Shared skills".to_string(),
    false,
  );

  append_configured_skill_roots(clawdbot_config_path(), None, &mut roots, &mut seen);
  append_configured_skill_roots(
    openclaw_config_path(),
    Some("OpenClaw"),
    &mut roots,
    &mut seen,
  );

  for path in get_fallback_skill_roots(workdir) {
    let label = format!(
      "Fallback: {}",
      path.file_name().and_then(|value| value.to_str()).unwrap_or("skills")
    );
    push_skill_root(&mut roots, &mut seen, path, label, false);
  }

  roots
}

fn append_configured_skill_roots(
  config_path: PathBuf,
  prefix: Option<&str>,
  roots: &mut Vec<ResolvedSkillRoot>,
  seen: &mut BTreeSet<String>,
) {
  let Some(config) = read_json5_file::<RuntimeWorkspaceConfig>(&config_path) else {
    return;
  };

  let label_prefix = prefix.map(|value| format!("{value}: ")).unwrap_or_default();

  if let Some(workspace) = clean_string(
    config
      .agents
      .as_ref()
      .and_then(|item| item.defaults.as_ref())
      .and_then(|item| item.workspace.as_ref()),
  )
  .or_else(|| clean_string(config.agent.as_ref().and_then(|item| item.workspace.as_ref())))
  {
    push_skill_root(
      roots,
      seen,
      resolve_workspace_skills_dir(&resolve_input_path(&workspace, None)),
      format!("{label_prefix}Agent: main"),
      false,
    );
  }

  for entry in config.agents.and_then(|item| item.list).unwrap_or_default() {
    let Some(workspace) = clean_string(entry.workspace.as_ref()) else {
      continue;
    };
    let name = clean_string(entry.name.as_ref())
      .or_else(|| clean_string(entry.id.as_ref()))
      .unwrap_or_else(|| "agent".to_string());
    push_skill_root(
      roots,
      seen,
      resolve_workspace_skills_dir(&resolve_input_path(&workspace, None)),
      format!("{label_prefix}Agent: {name}"),
      false,
    );
  }

  for (agent_id, entry) in config
    .routing
    .and_then(|item| item.agents)
    .unwrap_or_default()
  {
    let Some(workspace) = clean_string(entry.workspace.as_ref()) else {
      continue;
    };
    let name = clean_string(entry.name.as_ref()).unwrap_or(agent_id);
    push_skill_root(
      roots,
      seen,
      resolve_workspace_skills_dir(&resolve_input_path(&workspace, None)),
      format!("{label_prefix}Agent: {name}"),
      false,
    );
  }

  for dir in config
    .skills
    .and_then(|item| item.load)
    .and_then(|item| item.extra_dirs)
    .unwrap_or_default()
  {
    let Some(resolved) = clean_inline_string(&dir).map(|value| resolve_input_path(&value, None)) else {
      continue;
    };
    let label = format!(
      "{label_prefix}Extra: {}",
      resolved
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(resolved.to_string_lossy().as_ref())
    );
    push_skill_root(roots, seen, resolved, label, false);
  }
}

fn push_skill_root(
  roots: &mut Vec<ResolvedSkillRoot>,
  _seen: &mut BTreeSet<String>,
  path: PathBuf,
  label: String,
  selected: bool,
) {
  let normalized = normalized_path(&path);
  let key = path_key(&normalized);

  if let Some(existing) = roots.iter_mut().find(|item| path_key(&item.path) == key) {
    existing.selected |= selected;
    return;
  }

  roots.push(ResolvedSkillRoot {
    exists: normalized.exists(),
    path: normalized,
    label,
    selected,
  });
}

fn resolve_workspace_skills_dir(workspace: &Path) -> PathBuf {
  let lower = workspace.join("skills");
  if lower.exists() {
    return lower;
  }

  let upper = workspace.join("Skills");
  if upper.exists() {
    return upper;
  }

  lower
}

fn get_fallback_skill_roots(workdir: &Path) -> Vec<PathBuf> {
  let home = home_dir();
  let parent = workdir.parent().unwrap_or(workdir);
  let mut roots = Vec::new();
  let mut seen = BTreeSet::new();

  for path in [
    parent.join("clawdis").join("skills"),
    parent.join("clawdis").join("Skills"),
    parent.join("clawdbot").join("skills"),
    parent.join("clawdbot").join("Skills"),
    parent.join("openclaw").join("skills"),
    parent.join("openclaw").join("Skills"),
    parent.join("moltbot").join("skills"),
    parent.join("moltbot").join("Skills"),
    home.join("clawd").join("skills"),
    home.join("clawd").join("Skills"),
    home.join(".clawd").join("skills"),
    home.join(".clawd").join("Skills"),
    home.join("clawdbot").join("skills"),
    home.join("clawdbot").join("Skills"),
    home.join(".clawdbot").join("skills"),
    home.join(".clawdbot").join("Skills"),
    home.join("clawdis").join("skills"),
    home.join("clawdis").join("Skills"),
    home.join(".clawdis").join("skills"),
    home.join(".clawdis").join("Skills"),
    home.join("openclaw").join("skills"),
    home.join("openclaw").join("Skills"),
    home.join(".openclaw").join("skills"),
    home.join(".openclaw").join("Skills"),
    home.join("moltbot").join("skills"),
    home.join("moltbot").join("Skills"),
    home.join(".moltbot").join("skills"),
    home.join(".moltbot").join("Skills"),
    home.join("Library").join("Application Support").join("clawdbot").join("skills"),
    home.join("Library").join("Application Support").join("clawdbot").join("Skills"),
    home.join("Library").join("Application Support").join("clawdis").join("skills"),
    home.join("Library").join("Application Support").join("clawdis").join("Skills"),
    home.join("Library").join("Application Support").join("openclaw").join("skills"),
    home.join("Library").join("Application Support").join("openclaw").join("Skills"),
    home.join("Library").join("Application Support").join("moltbot").join("skills"),
    home.join("Library").join("Application Support").join("moltbot").join("Skills"),
  ] {
    let normalized = normalized_path(&path);
    let key = path_key(&normalized);
    if seen.insert(key) {
      roots.push(normalized);
    }
  }

  roots
}

fn detect_openclaw_targets(
  config: Option<&ManagerConfig>,
  workdir: &Path,
  skills_dir: &Path,
) -> (Option<ResolvedOpenClawTarget>, Vec<ResolvedOpenClawTarget>) {
  let mut candidates = Vec::new();

  if let Some(raw) = clean_string(config.and_then(|item| item.openclaw_path.as_ref())) {
    push_openclaw_candidate(
      &mut candidates,
      resolve_input_path(&raw, Some(workdir)),
      "Custom build".to_string(),
      "Manual override".to_string(),
      true,
      true,
    );
  }

  for (key, label) in [
    ("OPENCLAW_INSTALL_PATH", "OPENCLAW_INSTALL_PATH env"),
    ("OPENCLAW_BINARY_PATH", "OPENCLAW_BINARY_PATH env"),
    ("OPENCLAW_BINARY", "OPENCLAW_BINARY env"),
    ("CLAWDBOT_INSTALL_PATH", "CLAWDBOT_INSTALL_PATH env"),
    ("CLAWDBOT_BINARY_PATH", "CLAWDBOT_BINARY_PATH env"),
    ("CLAWDBOT_BINARY", "CLAWDBOT_BINARY env"),
  ] {
    if let Some(value) = env_value(key) {
      push_openclaw_candidate(
        &mut candidates,
        resolve_input_path(&value, None),
        "Detected build".to_string(),
        label.to_string(),
        true,
        false,
      );
    }
  }

  for path in probable_openclaw_locations(workdir, skills_dir) {
    let source = if path == normalized_path(workdir) {
      "Workspace root".to_string()
    } else {
      "Auto-detected install".to_string()
    };
    push_openclaw_candidate(
      &mut candidates,
      path,
      "Detected build".to_string(),
      source,
      false,
      false,
    );
  }

  if !candidates.iter().any(|item| item.selected) {
    if let Some(first) = candidates.first_mut() {
      first.selected = true;
    }
  }

  let selected = candidates.iter().find(|item| item.selected).cloned();
  (selected, candidates)
}

fn probable_openclaw_locations(workdir: &Path, skills_dir: &Path) -> Vec<PathBuf> {
  let home = home_dir();
  let mut paths = Vec::new();
  let mut seen = BTreeSet::new();

  let add = |paths: &mut Vec<PathBuf>, seen: &mut BTreeSet<String>, path: PathBuf| {
    let normalized = normalized_path(&path);
    let key = path_key(&normalized);
    if seen.insert(key) {
      paths.push(normalized);
    }
  };

  for base in [
    env_value("LOCALAPPDATA").map(PathBuf::from),
    env_value("PROGRAMFILES").map(PathBuf::from),
    env_value("PROGRAMFILES(X86)").map(PathBuf::from),
  ]
  .into_iter()
  .flatten()
  {
    add(&mut paths, &mut seen, base.join("Programs").join("OpenClaw"));
    add(&mut paths, &mut seen, base.join("Programs").join("Clawdbot"));
    add(&mut paths, &mut seen, base.join("OpenClaw"));
    add(&mut paths, &mut seen, base.join("Clawdbot"));
  }

  let parent = workdir.parent().unwrap_or(workdir);
  for path in [
    parent.join("openclaw"),
    parent.join("OpenClaw"),
    parent.join("clawdbot"),
    parent.join("Clawdbot"),
    normalized_path(workdir),
    normalized_path(skills_dir.parent().unwrap_or(skills_dir)),
    home.join("openclaw"),
    home.join("OpenClaw"),
    home.join("clawdbot"),
    home.join("Clawdbot"),
    home.join(".openclaw"),
    home.join(".clawdbot"),
  ] {
    add(&mut paths, &mut seen, path);
  }

  paths
}

fn push_openclaw_candidate(
  candidates: &mut Vec<ResolvedOpenClawTarget>,
  path: PathBuf,
  label: String,
  source: String,
  accept_any_existing_path: bool,
  selected: bool,
) {
  let normalized = normalized_path(&path);
  let key = path_key(&normalized);

  if let Some(existing) = candidates.iter_mut().find(|item| path_key(&item.path) == key) {
    existing.selected |= selected;
    return;
  }

  let exists = normalized.exists();
  if !accept_any_existing_path && !looks_like_openclaw_target(&normalized) {
    return;
  }

  let kind = classify_openclaw_target(&normalized);
  let display_label = derive_openclaw_label(&normalized, &label, &kind);
  candidates.push(ResolvedOpenClawTarget {
    path: normalized,
    label: display_label,
    source,
    kind,
    exists,
    selected,
  });
}

fn looks_like_openclaw_target(path: &Path) -> bool {
  if path.is_file() {
    return looks_like_openclaw_binary(path);
  }

  if !path.is_dir() {
    return false;
  }

  let name = path
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or_default()
    .to_ascii_lowercase();

  if name.contains("openclaw") || name.contains("clawdbot") {
    return true;
  }

  if path.join("skills").is_dir() || path.join("Skills").is_dir() {
    return true;
  }

  [
    path.join("OpenClaw.exe"),
    path.join("openclaw.exe"),
    path.join("Clawdbot.exe"),
    path.join("clawdbot.exe"),
    path.join("src-tauri").join("target").join("release").join("claw-pg.exe"),
  ]
  .into_iter()
  .any(|candidate| candidate.is_file())
}

fn classify_openclaw_target(path: &Path) -> String {
  if path.is_file() {
    return "binary".to_string();
  }

  if path.join("skills").is_dir() || path.join("Skills").is_dir() {
    return "workspace".to_string();
  }

  "directory".to_string()
}

fn derive_openclaw_label(path: &Path, fallback: &str, kind: &str) -> String {
  let name = path
    .file_name()
    .and_then(|value| value.to_str())
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or(fallback);

  match kind {
    "binary" => format!("Binary: {name}"),
    "workspace" => format!("Workspace: {name}"),
    _ => format!("Folder: {name}"),
  }
}

fn looks_like_openclaw_binary(path: &Path) -> bool {
  path
    .file_name()
    .and_then(|value| value.to_str())
    .map(|value| {
      matches!(
        value.to_ascii_lowercase().as_str(),
        "openclaw.exe"
          | "clawdbot.exe"
          | "openclaw.cmd"
          | "clawdbot.cmd"
          | "openclaw.bat"
          | "clawdbot.bat"
          | "openclaw"
          | "clawdbot"
      )
    })
    .unwrap_or(false)
}

fn looks_like_openclaw_script(path: &Path) -> bool {
  let name = path
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or_default()
    .to_ascii_lowercase();
  if !matches!(name.as_str(), "index.js" | "index.mjs" | "index.cjs") {
    return false;
  }

  let full = path.to_string_lossy().to_ascii_lowercase();
  full.contains("openclaw") || full.contains("clawdbot")
}

fn resolve_openclaw_runners(config: &ResolvedManagerConfig) -> Vec<OpenClawRunner> {
  let mut runners = Vec::new();
  let mut seen = BTreeSet::new();

  if let Some(target) = config.openclaw_target.as_ref() {
    if let Some(runner) = resolve_runner_from_path(&target.path) {
      push_openclaw_runner(&mut runners, &mut seen, runner);
    }
  }

  for candidate in &config.openclaw_candidates {
    if let Some(runner) = resolve_runner_from_path(&candidate.path) {
      push_openclaw_runner(&mut runners, &mut seen, runner);
    }
  }

  for candidate in search_openclaw_on_path() {
    if let Some(runner) = resolve_runner_from_path(&candidate) {
      push_openclaw_runner(&mut runners, &mut seen, runner);
    }
  }

  if let Some(runner) = resolve_global_openclaw_runner() {
    push_openclaw_runner(&mut runners, &mut seen, runner);
  }

  runners
}

fn push_openclaw_runner(
  runners: &mut Vec<OpenClawRunner>,
  seen: &mut BTreeSet<String>,
  runner: OpenClawRunner,
) {
  let key = runner.display().to_ascii_lowercase();
  if seen.insert(key) {
    runners.push(runner);
  }
}

fn probable_openclaw_binaries(base: &Path) -> Vec<PathBuf> {
  let mut candidates = Vec::new();
  let mut seen = BTreeSet::new();

  for path in [
    base.join("openclaw.exe"),
    base.join("clawdbot.exe"),
    base.join("openclaw.cmd"),
    base.join("clawdbot.cmd"),
    base.join("openclaw"),
    base.join("clawdbot"),
    base.join("bin").join("openclaw.exe"),
    base.join("bin").join("clawdbot.exe"),
    base.join("bin").join("openclaw.cmd"),
    base.join("bin").join("clawdbot.cmd"),
    base.join("bin").join("openclaw"),
    base.join("bin").join("clawdbot"),
    base.join("node_modules").join(".bin").join("openclaw.cmd"),
    base.join("node_modules").join(".bin").join("clawdbot.cmd"),
    base.join("node_modules").join(".bin").join("openclaw"),
    base.join("node_modules").join(".bin").join("clawdbot"),
  ] {
    let normalized = normalized_path(&path);
    let key = path_key(&normalized);
    if seen.insert(key) {
      candidates.push(normalized);
    }
  }

  candidates
}

fn probable_openclaw_scripts(base: &Path) -> Vec<PathBuf> {
  let mut candidates = Vec::new();
  let mut seen = BTreeSet::new();

  for path in [
    base.join("dist").join("index.js"),
    base.join("dist").join("index.mjs"),
    base.join("dist").join("index.cjs"),
    base.join("node_modules").join("openclaw").join("dist").join("index.js"),
    base.join("node_modules").join("clawdbot").join("dist").join("index.js"),
  ] {
    let normalized = normalized_path(&path);
    let key = path_key(&normalized);
    if seen.insert(key) {
      candidates.push(normalized);
    }
  }

  candidates
}

fn search_openclaw_on_path() -> Vec<PathBuf> {
  let mut matches = Vec::new();
  let mut seen = BTreeSet::new();

  if let Some(paths) = env::var_os("PATH") {
    for dir in env::split_paths(&paths) {
      for name in [
        "openclaw.exe",
        "clawdbot.exe",
        "openclaw.cmd",
        "clawdbot.cmd",
        "openclaw",
        "clawdbot",
      ] {
        let candidate = normalized_path(&dir.join(name));
        let key = path_key(&candidate);
        if seen.insert(key) {
          matches.push(candidate);
        }
      }
    }
  }

  matches
}

fn search_node_on_path() -> Vec<PathBuf> {
  let mut matches = Vec::new();
  let mut seen = BTreeSet::new();

  if let Some(paths) = env::var_os("PATH") {
    for dir in env::split_paths(&paths) {
      for name in ["node.exe", "node"] {
        let candidate = normalized_path(&dir.join(name));
        let key = path_key(&candidate);
        if seen.insert(key) {
          matches.push(candidate);
        }
      }
    }
  }

  matches
}

fn is_cmd_script(path: &Path) -> bool {
  path
    .extension()
    .and_then(OsStr::to_str)
    .map(|value| matches!(value.to_ascii_lowercase().as_str(), "cmd" | "bat"))
    .unwrap_or(false)
}

fn resolve_runner_from_path(path: &Path) -> Option<OpenClawRunner> {
  if path.is_file() {
    if looks_like_openclaw_binary(path) {
      return Some(if is_cmd_script(path) {
        OpenClawRunner::CmdScript(path.to_path_buf())
      } else {
        OpenClawRunner::Binary(path.to_path_buf())
      });
    }

    if looks_like_openclaw_script(path) {
      let node = resolve_node_executable()?;
      return Some(OpenClawRunner::NodeScript {
        node,
        script: path.to_path_buf(),
      });
    }

    return None;
  }

  if !path.is_dir() {
    return None;
  }

  for candidate in probable_openclaw_binaries(path) {
    if let Some(runner) = resolve_runner_from_path(&candidate) {
      return Some(runner);
    }
  }

  for candidate in probable_openclaw_scripts(path) {
    if let Some(runner) = resolve_runner_from_path(&candidate) {
      return Some(runner);
    }
  }

  None
}

fn resolve_global_openclaw_runner() -> Option<OpenClawRunner> {
  for candidate in probable_global_openclaw_paths() {
    if let Some(runner) = resolve_runner_from_path(&candidate) {
      return Some(runner);
    }
  }

  None
}

fn probable_global_openclaw_paths() -> Vec<PathBuf> {
  let mut candidates = Vec::new();
  let mut seen = BTreeSet::new();

  for path in [
    env_value("APPDATA")
      .map(PathBuf::from)
      .map(|root| root.join("npm").join("node_modules").join("openclaw").join("dist").join("index.js")),
    env_value("APPDATA")
      .map(PathBuf::from)
      .map(|root| root.join("npm").join("node_modules").join("clawdbot").join("dist").join("index.js")),
    env_value("APPDATA")
      .map(PathBuf::from)
      .map(|root| root.join("npm").join("openclaw.cmd")),
    env_value("APPDATA")
      .map(PathBuf::from)
      .map(|root| root.join("npm").join("clawdbot.cmd")),
  ]
  .into_iter()
  .flatten()
  {
    let normalized = normalized_path(&path);
    let key = path_key(&normalized);
    if seen.insert(key) {
      candidates.push(normalized);
    }
  }

  candidates
}

fn resolve_node_executable() -> Option<PathBuf> {
  for path in [
    env_value("ProgramFiles").map(PathBuf::from).map(|root| root.join("nodejs").join("node.exe")),
    env_value("PROGRAMFILES").map(PathBuf::from).map(|root| root.join("nodejs").join("node.exe")),
    env_value("ProgramFiles(x86)")
      .map(PathBuf::from)
      .map(|root| root.join("nodejs").join("node.exe")),
    env_value("PROGRAMFILES(X86)")
      .map(PathBuf::from)
      .map(|root| root.join("nodejs").join("node.exe")),
  ]
  .into_iter()
  .flatten()
  {
    if path.is_file() {
      return Some(path);
    }
  }

  for candidate in search_node_on_path() {
    if candidate.is_file() {
      return Some(candidate);
    }
  }

  None
}

fn build_openclaw_command(runner: &OpenClawRunner) -> Command {
  let mut command = match runner {
    OpenClawRunner::CmdScript(script) => {
      let mut inner = Command::new("cmd");
      inner.arg("/C").arg(command_safe_path(script));
      inner
    }
    OpenClawRunner::Binary(binary) => Command::new(command_safe_path(binary)),
    OpenClawRunner::NodeScript { node, script } => {
      let mut inner = Command::new(command_safe_path(node));
      inner.arg(command_safe_path(script));
      inner
    }
  };
  hide_command_window(&mut command);
  command
}

fn apply_command_env(command: &mut Command, extra_env: &[(String, String)]) {
  for (key, value) in extra_env {
    command.env(key, value);
  }
}

fn hide_command_window(command: &mut Command) {
  #[cfg(windows)]
  {
    command.creation_flags(CREATE_NO_WINDOW);
  }
}

async fn run_command_output(
  command: &mut Command,
  duration: Duration,
  timeout_message: &str,
  launch_context: &str,
) -> Result<std::process::Output, String> {
  timeout(duration, command.output())
    .await
    .map_err(|_| timeout_message.to_string())?
    .map_err(|error| format!("{launch_context}\n\n{error}"))
}

fn build_docker_exec_command(
  resolved: &ResolvedManagerConfig,
  openclaw_args: &[&str],
) -> Result<Command, String> {
  let container = resolved
    .docker_container
    .as_deref()
    .filter(|value| !value.trim().is_empty())
    .ok_or_else(|| "Enter a Docker container name first.".to_string())?;
  let docker_command = resolved.docker_command.trim();
  if docker_command.is_empty() {
    return Err("Enter a Docker command first.".to_string());
  }

  let command_parts: Vec<&str> = docker_command.split_whitespace().collect();
  if command_parts.is_empty() {
    return Err("Enter a Docker command first.".to_string());
  }

  let mut command = Command::new("docker");
  hide_command_window(&mut command);
  command.arg("exec");
  if let Some(workdir) = resolved.docker_workdir.as_ref() {
    if !workdir.trim().is_empty() {
      command.arg("-w").arg(workdir);
    }
  }
  command.arg(container);
  for part in command_parts {
    command.arg(part);
  }
  for arg in openclaw_args {
    command.arg(arg);
  }
  command.stdout(std::process::Stdio::piped());
  command.stderr(std::process::Stdio::piped());
  Ok(command)
}

fn write_remote_gateway_temp_config(resolved: &ResolvedManagerConfig) -> Result<TemporaryConfigFile, String> {
  let raw_gateway_url = resolved
    .gateway_url
    .as_ref()
    .filter(|value| !value.trim().is_empty())
    .cloned()
    .ok_or_else(|| "Enter a Gateway URL first.".to_string())?;
  let gateway_url = validate_remote_gateway_url(
    &raw_gateway_url,
    resolved
      .gateway_token
      .as_ref()
      .filter(|value| !value.trim().is_empty())
      .is_some(),
  )?;

  let mut value = read_json5_file::<serde_json::Value>(&openclaw_config_path())
    .or_else(|| read_json5_file::<serde_json::Value>(&clawdbot_config_path()))
    .unwrap_or_else(|| serde_json::Value::Object(Default::default()));
  if !value.is_object() {
    value = serde_json::Value::Object(Default::default());
  }

  let root = value.as_object_mut().expect("remote config root should be an object");
  let agents = ensure_json_object(root, "agents");
  let defaults = ensure_json_object(agents, "defaults");
  defaults
    .entry("workspace".to_string())
    .or_insert_with(|| serde_json::Value::String(resolved.workdir.display().to_string()));

  let gateway = ensure_json_object(root, "gateway");
  gateway.insert("mode".to_string(), serde_json::Value::String("remote".to_string()));
  let remote = ensure_json_object(gateway, "remote");
  remote.insert("url".to_string(), serde_json::Value::String(gateway_url.clone()));
  if gateway_url.starts_with("ws://") || gateway_url.starts_with("wss://") {
    remote.insert(
      "transport".to_string(),
      serde_json::Value::String("direct".to_string()),
    );
  }
  if let Some(token) = resolved.gateway_token.as_ref().filter(|value| !value.trim().is_empty()) {
    remote.insert("token".to_string(), serde_json::Value::String(token.clone()));
  } else {
    remote.remove("token");
  }

  let temp_path = env::temp_dir().join(format!(
    "claw-quest-remote-{}-{}.json5",
    std::process::id(),
    current_time_ms()
  ));
  let raw = serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?;
  fs::write(&temp_path, format!("{raw}\n")).map_err(|error| error.to_string())?;
  Ok(TemporaryConfigFile { path: temp_path })
}

fn ensure_json_object<'a>(
  root: &'a mut serde_json::Map<String, serde_json::Value>,
  key: &str,
) -> &'a mut serde_json::Map<String, serde_json::Value> {
  let needs_insert = !root
    .get(key)
    .map(serde_json::Value::is_object)
    .unwrap_or(false);
  if needs_insert {
    root.insert(key.to_string(), serde_json::Value::Object(Default::default()));
  }

  root
    .get_mut(key)
    .and_then(serde_json::Value::as_object_mut)
    .expect("json key should contain an object")
}

fn validate_remote_gateway_url(raw: &str, has_token: bool) -> Result<String, String> {
  let parsed = reqwest::Url::parse(raw).map_err(|_| "Enter a valid Gateway URL first.".to_string())?;
  let scheme = parsed.scheme();
  if !matches!(scheme, "http" | "https" | "ws" | "wss") {
    return Err("Gateway URL must use http://, https://, ws://, or wss://.".to_string());
  }

  if has_token && !matches!(scheme, "https" | "wss") {
    return Err("Gateway tokens require a secure Gateway URL using https:// or wss://.".to_string());
  }

  Ok(parsed.to_string())
}

fn command_safe_path(path: &Path) -> PathBuf {
  let raw = path.to_string_lossy();
  if let Some(rest) = raw.strip_prefix("\\\\?\\UNC\\") {
    return PathBuf::from(format!("\\\\{rest}"));
  }

  if let Some(rest) = raw.strip_prefix("\\\\?\\") {
    return PathBuf::from(rest);
  }

  path.to_path_buf()
}

fn resolve_command_workdir(preferred: &Path) -> PathBuf {
  let preferred_safe = command_safe_path(preferred);
  if preferred_safe.is_dir() {
    return preferred_safe;
  }

  for candidate in [
    resolve_workspace_from_config(openclaw_config_path()),
    resolve_workspace_from_config(clawdbot_config_path()),
    env::current_dir().ok(),
    Some(home_dir()),
  ]
  .into_iter()
  .flatten()
  {
    let safe = command_safe_path(&candidate);
    if safe.is_dir() {
      return safe;
    }
  }

  PathBuf::from(".")
}

fn command_output_detail(output: &std::process::Output) -> String {
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
  if !stderr.is_empty() {
    return stderr;
  }

  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if !stdout.is_empty() {
    return stdout;
  }

  String::new()
}

fn read_lockfile(workdir: &Path) -> Lockfile {
  for path in [
    workdir.join(DOT_DIR).join("lock.json"),
    workdir.join(LEGACY_DOT_DIR).join("lock.json"),
  ] {
    if let Ok(raw) = fs::read_to_string(path) {
      if let Ok(lockfile) = serde_json::from_str::<Lockfile>(&raw) {
        return lockfile;
      }
    }
  }

  Lockfile::default()
}

fn write_lockfile(workdir: &Path, lockfile: &Lockfile) -> Result<(), String> {
  let path = workdir.join(DOT_DIR).join("lock.json");
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  let raw = serde_json::to_string_pretty(lockfile).map_err(|error| error.to_string())?;
  fs::write(path, format!("{raw}\n")).map_err(|error| error.to_string())
}

fn read_skill_origin(skill_dir: &Path) -> Option<SkillOrigin> {
  for path in [
    skill_dir.join(DOT_DIR).join("origin.json"),
    skill_dir.join(LEGACY_DOT_DIR).join("origin.json"),
  ] {
    if let Ok(raw) = fs::read_to_string(path) {
      if let Ok(origin) = serde_json::from_str::<SkillOrigin>(&raw) {
        return Some(origin);
      }
    }
  }

  None
}

fn write_skill_origin(skill_dir: &Path, origin: &SkillOrigin) -> Result<(), String> {
  let path = skill_dir.join(DOT_DIR).join("origin.json");
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  let raw = serde_json::to_string_pretty(origin).map_err(|error| error.to_string())?;
  fs::write(path, format!("{raw}\n")).map_err(|error| error.to_string())
}

fn detect_default_workdir() -> (PathBuf, String) {
  if let Some(value) = env_value("OPENCLAW_WORKDIR") {
    return (resolve_input_path(&value, None), "OPENCLAW_WORKDIR env".to_string());
  }

  if let Some(workspace) = resolve_workspace_from_config(openclaw_config_path()) {
    return (workspace, "OpenClaw config".to_string());
  }

  if let Some(value) = env_value("CLAWHUB_WORKDIR").or_else(|| env_value("CLAWDHUB_WORKDIR")) {
    return (resolve_input_path(&value, None), "CLAWHUB_WORKDIR env".to_string());
  }

  if let Some(workspace) = resolve_workspace_from_config(clawdbot_config_path()) {
    return (workspace, "Clawdbot config".to_string());
  }

  if let Ok(current_dir) = env::current_dir() {
    return (current_dir, "current directory".to_string());
  }

  (home_dir(), "home directory".to_string())
}

fn detect_default_agent_id() -> Option<String> {
  resolve_default_agent_id_from_config(openclaw_config_path())
    .or_else(|| resolve_default_agent_id_from_config(clawdbot_config_path()))
}

fn resolve_workspace_from_config(path: PathBuf) -> Option<PathBuf> {
  let config = read_json5_file::<RuntimeWorkspaceConfig>(&path)?;
  let default_workspace = clean_string(
    config
      .agents
      .as_ref()
      .and_then(|item| item.defaults.as_ref())
      .and_then(|item| item.workspace.as_ref()),
  )
  .or_else(|| clean_string(config.agent.as_ref().and_then(|item| item.workspace.as_ref())));

  if let Some(workspace) = default_workspace {
    return Some(resolve_input_path(&workspace, None));
  }

  let entries = config.agents.and_then(|item| item.list).unwrap_or_default();
  let preferred = entries
    .iter()
    .find(|entry| entry.default.unwrap_or(false))
    .or_else(|| entries.iter().find(|entry| entry.id.as_deref() == Some("main")));

  preferred
    .and_then(|entry| clean_string(entry.workspace.as_ref()))
    .map(|workspace| resolve_input_path(&workspace, None))
}

fn resolve_default_agent_id_from_config(path: PathBuf) -> Option<String> {
  let config = read_json5_file::<RuntimeWorkspaceConfig>(&path)?;
  let entries = config
    .agents
    .as_ref()
    .and_then(|item| item.list.as_ref());

  let preferred = entries.and_then(|items| {
    items
      .iter()
      .find(|entry| entry.default.unwrap_or(false))
      .or_else(|| items.iter().find(|entry| entry.id.as_deref() == Some("main")))
  });

  if let Some(agent_id) = preferred.and_then(|entry| clean_string(entry.id.as_ref())) {
    return Some(agent_id);
  }

  if let Some(routing) = config.routing.as_ref().and_then(|item| item.agents.as_ref()) {
    if routing.contains_key("main") {
      return Some("main".to_string());
    }

    if let Some(first) = routing.keys().next() {
      if let Some(cleaned) = clean_inline_string(first) {
        return Some(cleaned);
      }
    }
  }

  None
}

fn clawdbot_state_dir() -> PathBuf {
  if let Some(value) = env_value("CLAWDBOT_STATE_DIR") {
    return resolve_input_path(&value, None);
  }

  home_dir().join(".clawdbot")
}

fn clawdbot_config_path() -> PathBuf {
  if let Some(value) = env_value("CLAWDBOT_CONFIG_PATH") {
    return resolve_input_path(&value, None);
  }

  clawdbot_state_dir().join("clawdbot.json")
}

fn openclaw_state_dir() -> PathBuf {
  if let Some(value) = env_value("OPENCLAW_STATE_DIR") {
    return resolve_input_path(&value, None);
  }

  home_dir().join(".openclaw")
}

fn openclaw_config_path() -> PathBuf {
  if let Some(value) = env_value("OPENCLAW_CONFIG_PATH") {
    return resolve_input_path(&value, None);
  }

  openclaw_state_dir().join("openclaw.json")
}

fn env_value(key: &str) -> Option<String> {
  env::var(key)
    .ok()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
}

fn home_dir() -> PathBuf {
  if cfg!(windows) {
    if let Some(path) = env_value("USERPROFILE")
      .or_else(|| env_value("HOME"))
      .or_else(|| {
        let drive = env::var("HOMEDRIVE").ok()?;
        let path = env::var("HOMEPATH").ok()?;
        Some(format!("{drive}{path}"))
      })
    {
      return PathBuf::from(path);
    }
  } else if let Some(path) = env_value("HOME") {
    return PathBuf::from(path);
  }

  env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn resolve_input_path(raw: &str, base: Option<&Path>) -> PathBuf {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return base
      .map(Path::to_path_buf)
      .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
  }

  let expanded = if trimmed.starts_with('~') {
    match trimmed.strip_prefix("~/").or_else(|| trimmed.strip_prefix("~\\")) {
      Some(rest) => home_dir().join(rest),
      None => home_dir(),
    }
  } else {
    PathBuf::from(trimmed)
  };

  if expanded.is_absolute() {
    expanded
  } else if let Some(base_dir) = base {
    base_dir.join(expanded)
  } else {
    env::current_dir()
      .unwrap_or_else(|_| PathBuf::from("."))
      .join(expanded)
  }
}

fn normalized_path(path: &Path) -> PathBuf {
  fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn path_key(path: &Path) -> String {
  path.to_string_lossy().to_ascii_lowercase()
}

fn clean_string(value: Option<&String>) -> Option<String> {
  value
    .map(|item| item.trim().to_string())
    .filter(|item| !item.is_empty())
}

fn clean_inline_string(value: &str) -> Option<String> {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    None
  } else {
    Some(trimmed.to_string())
  }
}

fn build_client() -> Result<Client, String> {
  Client::builder()
    .timeout(Duration::from_secs(20))
    .user_agent("claw-pg")
    .build()
    .map_err(|error| error.to_string())
}

fn clamp_limit(limit: Option<u32>) -> u32 {
  limit.unwrap_or(24).clamp(1, 60)
}

fn normalize_sort(sort: Option<&str>) -> Option<&'static str> {
  match sort.unwrap_or("downloads").trim() {
    "downloads" => Some("downloads"),
    "trending" => Some("trending"),
    "newest" => None,
    _ => Some("downloads"),
  }
}

fn normalize_connection_mode(mode: &str) -> String {
  match mode.trim() {
    "remote" => "remote".to_string(),
    "docker" => "docker".to_string(),
    _ => "local".to_string(),
  }
}

fn sanitize_slug(raw: &str) -> Result<String, String> {
  let slug = raw.trim().to_string();
  if !is_safe_slug(&slug) {
    return Err(format!("Invalid skill slug: {raw}"));
  }
  Ok(slug)
}

fn is_safe_slug(slug: &str) -> bool {
  !slug.trim().is_empty()
    && !slug.contains('/')
    && !slug.contains('\\')
    && !slug.contains("..")
}

async fn download_response_to_file(
  response: &mut reqwest::Response,
  target_path: &Path,
) -> Result<(), String> {
  if let Some(content_length) = response.content_length() {
    if content_length > MAX_SKILL_ARCHIVE_BYTES {
      return Err(format!(
        "Skill archive is too large ({content_length} bytes). Max allowed is {MAX_SKILL_ARCHIVE_BYTES} bytes."
      ));
    }
  }

  let mut total_written = 0u64;
  let mut output = fs::File::create(target_path).map_err(|error| error.to_string())?;
  while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
    total_written += chunk.len() as u64;
    if total_written > MAX_SKILL_ARCHIVE_BYTES {
      return Err(format!(
        "Skill archive exceeds the max allowed size of {MAX_SKILL_ARCHIVE_BYTES} bytes."
      ));
    }

    output.write_all(&chunk).map_err(|error| error.to_string())?;
  }

  Ok(())
}

fn extract_zip_archive(archive_path: &Path, target_dir: &Path) -> Result<(), String> {
  let file = fs::File::open(archive_path).map_err(|error| error.to_string())?;
  let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
  if archive.len() > MAX_SKILL_ARCHIVE_ENTRIES {
    return Err(format!(
      "Skill archive contains too many entries ({}). Max allowed is {MAX_SKILL_ARCHIVE_ENTRIES}.",
      archive.len()
    ));
  }

  let mut total_extracted = 0u64;
  for index in 0..archive.len() {
    let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
    let Some(relative_path) = entry.enclosed_name() else {
      continue;
    };
    let output_path = target_dir.join(&relative_path);

    if entry.name().ends_with('/') {
      fs::create_dir_all(&output_path).map_err(|error| error.to_string())?;
      continue;
    }

    if let Some(parent) = output_path.parent() {
      fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let mut output = fs::File::create(&output_path).map_err(|error| error.to_string())?;
    let mut entry_written = 0u64;
    let mut buffer = [0u8; 8192];
    loop {
      let read = entry.read(&mut buffer).map_err(|error| error.to_string())?;
      if read == 0 {
        break;
      }

      let read = read as u64;
      entry_written += read;
      total_extracted += read;
      if entry_written > MAX_SKILL_ENTRY_BYTES {
        return Err(format!(
          "Skill archive entry {} exceeds the max allowed size of {MAX_SKILL_ENTRY_BYTES} bytes.",
          relative_path.display()
        ));
      }
      if total_extracted > MAX_SKILL_EXTRACTED_BYTES {
        return Err(format!(
          "Skill archive expands beyond the max allowed size of {MAX_SKILL_EXTRACTED_BYTES} bytes."
        ));
      }

      output
        .write_all(&buffer[..read as usize])
        .map_err(|error| error.to_string())?;
    }
  }

  Ok(())
}

fn remove_path(path: &Path) -> Result<(), String> {
  if path.is_dir() {
    fs::remove_dir_all(path).map_err(|error| error.to_string())?;
  } else if path.exists() {
    fs::remove_file(path).map_err(|error| error.to_string())?;
  }

  Ok(())
}

async fn read_response_error(response: reqwest::Response) -> String {
  let status = response.status();
  let text = response.text().await.unwrap_or_default();
  if text.trim().is_empty() {
    format!("Request failed with HTTP {status}")
  } else {
    format!("HTTP {status}: {text}")
  }
}

fn current_time_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as i64)
    .unwrap_or_default()
}

fn read_json5_file<T: DeserializeOwned>(path: &Path) -> Option<T> {
  let raw = fs::read_to_string(path).ok()?;
  json5::from_str::<T>(&raw).ok()
}
