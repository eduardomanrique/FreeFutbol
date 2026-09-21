use campo_core::{Input, MotionPose, Player, Simulation, Vec3, SIMULATION_VERSION};
use godot::classes::{IRefCounted, RefCounted};
use godot::prelude::*;

struct CampoExtension;
// SAFETY: only Godot's generated extension registration is exposed; no custom
// raw-pointer API or shared mutable simulation state crosses the boundary.
#[gdextension]
unsafe impl ExtensionLibrary for CampoExtension {}

#[derive(GodotClass)]
#[class(base=RefCounted)]
struct CampoSimulation {
    simulation: Simulation,
    base: Base<RefCounted>,
}

#[godot_api]
impl IRefCounted for CampoSimulation {
    fn init(base: Base<RefCounted>) -> Self {
        Self {
            simulation: Simulation::new(),
            base,
        }
    }
}
fn vector(v: Vec3) -> Vector3 {
    Vector3::new(v.x, v.y, v.z)
}
fn athlete_snapshot(player: &Player, pose: MotionPose, tick: u64) -> VarDictionary {
    let mut result = VarDictionary::new();
    result.set("player_position", vector(player.position));
    result.set("player_velocity", vector(player.velocity));
    result.set("facing", vector(player.facing));
    result.set("left_foot", vector(pose.left_foot));
    result.set("right_foot", vector(pose.right_foot));
    result.set("shot_phase", pose.shot_phase);
    result.set("striking", pose.striking);
    result.set("charge", 0.0_f32);
    result.set("tick", tick as i64);
    result
}
#[godot_api]
impl CampoSimulation {
    #[func]
    #[allow(clippy::too_many_arguments)]
    fn advance_actions(
        &mut self,
        x: f32,
        z: f32,
        sprint: bool,
        shoot: bool,
        cancel: bool,
        pass: bool,
        tackle: bool,
    ) -> VarDictionary {
        self.simulation.step_actions(
            Input {
                x,
                z,
                sprint,
                shoot,
                cancel,
            },
            pass,
            tackle,
        );
        self.snapshot()
    }

    #[func]
    fn advance(
        &mut self,
        x: f32,
        z: f32,
        sprint: bool,
        shoot: bool,
        cancel: bool,
    ) -> VarDictionary {
        self.simulation.step(Input {
            x,
            z,
            sprint,
            shoot,
            cancel,
        });
        self.snapshot()
    }
    #[func]
    fn snapshot(&self) -> VarDictionary {
        let s = &self.simulation;
        let mut result = VarDictionary::new();
        result.set("simulation_version", SIMULATION_VERSION);
        result.set("player_position", vector(s.player.position));
        result.set("player_velocity", vector(s.player.velocity));
        result.set("facing", vector(s.player.facing));
        result.set("ball_position", vector(s.ball.position));
        result.set("ball_velocity", vector(s.ball.velocity));
        result.set("tick", s.tick as i64);
        result.set("goals", s.goals as i64);
        result.set("charge", s.charge);
        result.set(
            "teammate",
            &athlete_snapshot(&s.teammate, s.teammate_pose(), s.tick),
        );
        result.set(
            "defender",
            &athlete_snapshot(&s.defender, s.defender_pose(), s.tick),
        );
        result.set("possession", s.possession.map(i32::from).unwrap_or(-1));
        result.set("passes_completed", s.passes_completed as i64);
        result.set("tackles_won", s.tackles_won as i64);
        let pose = s.pose();
        result.set("left_foot", vector(pose.left_foot));
        result.set("right_foot", vector(pose.right_foot));
        result.set("shot_phase", pose.shot_phase);
        result.set("striking", pose.striking);
        result
    }
    #[func]
    fn cancel_action(&mut self) {
        self.simulation.cancel_action();
    }
    #[func]
    fn reset_match(&mut self) {
        self.simulation.reset();
    }
}
