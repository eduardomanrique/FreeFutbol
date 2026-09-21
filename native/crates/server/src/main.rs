//! Headless host for the same core loaded by Godot. No sockets in this slice.
use campo_core::{Input, Simulation};
use std::time::Instant;
fn main() {
    let ticks = match std::env::args().nth(1) {
        Some(v) => v
            .parse::<u64>()
            .ok()
            .filter(|n| *n <= 1_000_000)
            .unwrap_or_else(|| {
                eprintln!("usage: campo-server [ticks 0..1000000]");
                std::process::exit(2)
            }),
        None => 1200,
    };
    let mut game = Simulation::new();
    let started = Instant::now();
    for i in 0..ticks {
        game.step(Input {
            x: 1.0,
            z: 0.0,
            sprint: i % 600 < 240,
            shoot: (240..300).contains(&(i % 600)),
            cancel: false,
        });
    }
    println!(
        "ticks={} goals={} ball=({:.3},{:.3},{:.3}) wall_ms={:.3}",
        game.tick,
        game.goals,
        game.ball.position.x,
        game.ball.position.y,
        game.ball.position.z,
        started.elapsed().as_secs_f64() * 1000.0
    );
}
