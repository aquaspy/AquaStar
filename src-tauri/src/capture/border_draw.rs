use super::{Applied, Desired, Host, NativeOp, Observation, SampleHint};

pub(super) struct Drawer {
    applied: Applied,
}

impl Drawer {
    pub(super) fn open(_host: Host) -> Self {
        Self {
            applied: Applied::default(),
        }
    }

    pub(super) fn sample(&mut self, _hint: &SampleHint) -> Observation {
        Observation::default()
    }

    pub(super) fn sync(&mut self, goal: &Desired) {
        for op in super::plan(&self.applied, goal) {
            if !self.perform(&op) {
                break;
            }
            super::commit(&mut self.applied, &op);
        }
    }

    fn perform(&mut self, _op: &NativeOp) -> bool {
        true
    }
}

impl Drop for Drawer {
    fn drop(&mut self) {}
}
