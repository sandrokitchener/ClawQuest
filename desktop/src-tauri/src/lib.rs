mod manager;

use manager::{
  browse_registry_skills,
  install_registry_skill,
  load_manager_state,
  poll_remote_gateway_session_update,
  search_registry_skills,
  send_openclaw_prompt,
  uninstall_registry_skill,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      browse_registry_skills,
      install_registry_skill,
      load_manager_state,
      poll_remote_gateway_session_update,
      search_registry_skills,
      send_openclaw_prompt,
      uninstall_registry_skill
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
