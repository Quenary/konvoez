use napi::bindgen_prelude::*;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::thread::JoinHandle;

pub fn start_hook(_callback: Function, _stopper: Arc<AtomicBool>) -> Result<JoinHandle<()>> {
    Err(Error::new(
        Status::GenericFailure,
        "Windows key hook not enabled in this commit".to_string(),
    ))
}
