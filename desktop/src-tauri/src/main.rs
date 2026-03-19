#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod manager;

use manager::{
  browse_registry_skills,
  install_registry_skill,
  load_manager_state,
  search_registry_skills,
  send_openclaw_prompt,
  uninstall_registry_skill,
};

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      browse_registry_skills,
      install_registry_skill,
      load_manager_state,
      search_registry_skills,
      send_openclaw_prompt,
      uninstall_registry_skill
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
