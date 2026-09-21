use campo_core::{Input, Simulation, Vec3, DT};

fn horizontal_distance(left: Vec3, right: Vec3) -> f32 {
    let x = left.x - right.x;
    let z = left.z - right.z;
    (x * x + z * z).sqrt()
}

fn horizontal_speed(value: Vec3) -> f32 {
    (value.x * value.x + value.z * value.z).sqrt()
}

fn finite_state(simulation: &Simulation) -> bool {
    let values = [
        simulation.player.position.x,
        simulation.player.position.y,
        simulation.player.position.z,
        simulation.player.velocity.x,
        simulation.player.velocity.y,
        simulation.player.velocity.z,
        simulation.ball.position.x,
        simulation.ball.position.y,
        simulation.ball.position.z,
        simulation.ball.velocity.x,
        simulation.ball.velocity.y,
        simulation.ball.velocity.z,
        simulation.charge,
    ];
    values.into_iter().all(f32::is_finite)
}

#[test]
fn same_inputs_from_a_checkpoint_are_identical() {
    let mut first = Simulation::new();
    for _ in 0..31 {
        first.step(Input {
            x: 0.6,
            z: -0.2,
            sprint: true,
            ..Input::default()
        });
    }
    let mut second = first.clone();
    let inputs = [
        Input {
            x: -1.0,
            z: 0.5,
            sprint: false,
            shoot: true,
            cancel: false,
        },
        Input {
            x: 0.0,
            z: 0.0,
            sprint: false,
            shoot: false,
            cancel: false,
        },
        Input {
            x: 0.3,
            z: 0.0,
            sprint: true,
            shoot: false,
            cancel: false,
        },
    ];
    for input in inputs.into_iter().cycle().take(180) {
        first.step(input);
        second.step(input);
    }
    assert_eq!(first, second);
}

#[test]
fn invalid_input_never_creates_nan() {
    let mut simulation = Simulation::new();
    for _ in 0..20 {
        simulation.step(Input {
            x: f32::NAN,
            z: f32::INFINITY,
            sprint: true,
            shoot: true,
            cancel: false,
        });
        assert!(finite_state(&simulation));
    }
    simulation.step(Input {
        x: f32::NEG_INFINITY,
        z: f32::NAN,
        sprint: false,
        shoot: false,
        cancel: true,
    });
    assert!(finite_state(&simulation));
    assert_eq!(simulation.charge, 0.0);
}

#[test]
fn acceleration_is_progressive_and_speed_is_capped() {
    let mut simulation = Simulation::new();
    simulation.step(Input {
        x: 1.0,
        z: 0.0,
        sprint: false,
        ..Input::default()
    });
    assert!(simulation.player.velocity.x > 0.0);
    assert!(simulation.player.velocity.x < 6.67);
    for _ in 0..600 {
        simulation.step(Input {
            x: 1.0,
            z: 0.0,
            sprint: true,
            ..Input::default()
        });
    }
    assert!(simulation.player.velocity.x <= 9.775 + 1.0e-4);
    assert!(simulation.player.position.x <= 45.5);
}

#[test]
fn discrete_touches_keep_the_ball_ahead_at_walk_and_sprint_pace() {
    let mut simulation = Simulation::new();
    for _ in 0..180 {
        simulation.step(Input {
            x: 1.0,
            z: 0.0,
            ..Input::default()
        });
    }
    assert!(simulation.ball.position.x > simulation.player.position.x);
    assert!(simulation.ball.position.x - simulation.player.position.x < 4.0);

    for _ in 0..180 {
        simulation.step(Input {
            x: 1.0,
            z: 0.0,
            sprint: true,
            ..Input::default()
        });
    }
    assert!(simulation.ball.position.x > simulation.player.position.x);
    assert!(simulation.ball.position.x - simulation.player.position.x < 5.0);
}

#[test]
fn walking_stops_with_a_reachable_ball_and_sprint_has_a_distinct_pace() {
    let mut walking = Simulation::new();
    for _ in 0..180 {
        walking.step(Input {
            x: 1.0,
            ..Input::default()
        });
    }
    let walk_speed = horizontal_speed(walking.player.velocity);
    let walk_ball_lead = walking.ball.position.x - walking.player.position.x;
    for _ in 0..180 {
        walking.step(Input::default());
    }
    assert!(horizontal_speed(walking.player.velocity) < 0.1);
    assert!(horizontal_speed(walking.ball.velocity) < 0.1);
    assert!(horizontal_distance(walking.player.position, walking.ball.position) <= 1.2);

    let mut sprinting = Simulation::new();
    for _ in 0..180 {
        sprinting.step(Input {
            x: 1.0,
            sprint: true,
            ..Input::default()
        });
    }
    let sprint_speed = horizontal_speed(sprinting.player.velocity);
    let sprint_ball_lead = sprinting.ball.position.x - sprinting.player.position.x;
    assert!(walk_speed > 2.0 && walk_speed < 3.5);
    assert!(sprint_speed > walk_speed + 3.0);
    assert!(sprint_ball_lead > walk_ball_lead);
}

#[test]
fn a_distant_ball_keeps_momentum_without_a_pull_contact() {
    let mut simulation = Simulation::new();
    simulation.ball.position = Vec3::new(-16.0, 0.11, 0.0);
    simulation.ball.velocity = Vec3::new(4.0, 0.0, 0.0);
    let before = simulation.ball.position;
    for _ in 0..30 {
        simulation.step(Input::default());
    }
    assert!(simulation.ball.position.x > before.x);
    assert!(horizontal_distance(simulation.player.position, simulation.ball.position) > 1.2);
}

#[test]
fn ground_contact_preserves_a_horizontal_motion_and_vertical_rebound() {
    let mut simulation = Simulation::new();
    simulation.ball.position = Vec3::new(-10.0, 0.2, 0.0);
    simulation.ball.velocity = Vec3::new(4.0, -20.0, 0.0);
    simulation.step(Input::default());
    assert!(simulation.ball.velocity.x > 0.0);
    assert!(simulation.ball.velocity.y > 0.0);
}

#[test]
fn charged_release_has_windup_then_ball_flight() {
    let mut simulation = Simulation::new();
    for _ in 0..30 {
        simulation.step(Input {
            shoot: true,
            ..Input::default()
        });
    }
    let charge_before_release = simulation.charge;
    assert!(charge_before_release > 0.2);
    simulation.step(Input::default());
    assert_eq!(simulation.charge, 0.0);
    assert_eq!(simulation.ball.velocity, Vec3::ZERO);
    let mut contact_seen = false;
    for _ in 0..36 {
        simulation.step(Input::default());
        if simulation.ball.velocity.x > 5.0 {
            contact_seen = true;
            assert!(simulation.pose().striking);
            assert!(simulation.pose().shot_phase > 0.45);
            break;
        }
    }
    assert!(
        contact_seen,
        "released shot never reached a swept-foot contact"
    );
    assert!(simulation.ball.position.x > -19.1);
    assert!(simulation.ball.position.y >= 0.0);
    assert!((DT - 1.0 / 120.0).abs() < f32::EPSILON);
}

#[test]
fn held_charge_auto_releases_once_and_does_not_slide_forever() {
    let mut simulation = Simulation::new();
    for _ in 0..30 {
        simulation.step(Input {
            x: 1.0,
            ..Input::default()
        });
    }
    let start = simulation.player.position;
    let mut contacts = 0;
    let mut previous_speed = horizontal_speed(simulation.ball.velocity);
    for _ in 0..240 {
        simulation.step(Input {
            x: 1.0,
            shoot: true,
            ..Input::default()
        });
        let speed = horizontal_speed(simulation.ball.velocity);
        if speed > previous_speed + 5.0 {
            contacts += 1;
        }
        previous_speed = speed;
    }
    assert_eq!(
        contacts, 1,
        "contacts={contacts}, player={:?}, ball={:?}, charge={}",
        simulation.player, simulation.ball, simulation.charge
    );
    assert_eq!(simulation.charge, 0.0);
    assert!(!simulation.pose().striking);
    assert!(simulation.player.position.x - start.x < 6.0);
}

#[test]
fn pose_reports_bounded_feet_and_contact_happens_before_impulse() {
    let mut simulation = Simulation::new();
    let rest = simulation.pose();
    assert!(rest.left_foot.y >= 0.05);
    assert!(rest.right_foot.y >= 0.05);
    assert!(rest.shot_phase.abs() <= f32::EPSILON);
    assert!(!rest.striking);

    for _ in 0..24 {
        simulation.step(Input {
            shoot: true,
            ..Input::default()
        });
        let pose = simulation.pose();
        assert!(pose.shot_phase > 0.1 && pose.shot_phase <= 0.35);
        assert!(!pose.striking);
        assert!(pose.right_foot.y >= 0.05);
        assert!(horizontal_distance(pose.right_foot, simulation.player.position) <= 1.05 + 1.0e-4);
        assert!(horizontal_speed(simulation.ball.velocity) <= f32::EPSILON);
    }
    simulation.step(Input::default());

    let mut contacted = false;
    for _ in 0..36 {
        simulation.step(Input::default());
        let pose = simulation.pose();
        assert!(pose.right_foot.y >= 0.05);
        assert!(horizontal_distance(pose.right_foot, simulation.player.position) <= 1.05 + 1.0e-4);
        if simulation.ball.velocity.x > 5.0 {
            contacted = true;
            assert!(pose.striking);
            assert!(pose.shot_phase > 0.35);
            break;
        }
    }
    assert!(contacted, "the swept right foot did not contact the ball");
}

#[test]
fn escaped_ball_cancels_gesture_without_a_remote_shot() {
    let mut simulation = Simulation::new();
    for _ in 0..20 {
        simulation.step(Input {
            shoot: true,
            ..Input::default()
        });
    }
    simulation.ball.position = Vec3::new(
        simulation.player.position.x + 2.0,
        simulation.player.position.y + 0.11,
        simulation.player.position.z,
    );
    simulation.step(Input::default());
    for _ in 0..30 {
        simulation.step(Input::default());
    }
    assert_eq!(simulation.ball.velocity, Vec3::ZERO);
    assert!(!simulation.pose().striking);
    assert_eq!(simulation.charge, 0.0);
}

#[test]
fn cancel_clears_queued_contact_and_suppresses_following_release() {
    let mut simulation = Simulation::new();
    for _ in 0..20 {
        simulation.step(Input {
            shoot: true,
            ..Input::default()
        });
    }
    simulation.step(Input::default());
    assert!(simulation.pose().striking);
    simulation.cancel_action();
    for _ in 0..30 {
        simulation.step(Input::default());
    }
    assert_eq!(simulation.ball.velocity, Vec3::ZERO);
    assert!(!simulation.pose().striking);
    assert_eq!(simulation.charge, 0.0);
}

#[test]
fn charge_commits_previous_movement_but_current_direction_changes_only_aim() {
    let mut simulation = Simulation::new();
    for _ in 0..30 {
        simulation.step(Input {
            x: 1.0,
            ..Input::default()
        });
    }
    let before = simulation.player.position;
    for _ in 0..12 {
        simulation.step(Input {
            z: 1.0,
            shoot: true,
            ..Input::default()
        });
    }
    assert!(simulation.player.position.x > before.x);
    assert!((simulation.player.position.z - before.z).abs() < 0.02);
}

#[test]
fn charged_aim_is_recorded_and_used_at_contact() {
    let mut simulation = Simulation::new();
    for _ in 0..24 {
        simulation.step(Input {
            z: 1.0,
            shoot: true,
            ..Input::default()
        });
    }
    simulation.step(Input::default());
    let mut contacted = false;
    for _ in 0..36 {
        simulation.step(Input::default());
        if simulation.ball.velocity.x > 0.0 {
            contacted = true;
            assert!(simulation.ball.velocity.z > 0.0);
            break;
        }
    }
    assert!(contacted, "aimed charge never reached contact");
}

#[test]
fn shot_uses_the_player_facing_to_choose_a_real_goal_target() {
    let mut simulation = Simulation::new();
    simulation.player.facing = Vec3::new(0.0, 0.0, 1.0);
    for _ in 0..30 {
        simulation.step(Input {
            z: 1.0,
            shoot: true,
            ..Input::default()
        });
    }
    simulation.step(Input::default());
    for _ in 0..36 {
        simulation.step(Input::default());
        if simulation.ball.velocity.x > 0.0 {
            break;
        }
    }
    assert!(simulation.ball.velocity.x > 0.0);
    assert!(simulation.ball.velocity.z > 0.0);
}

#[test]
fn cancel_suppresses_release() {
    let mut simulation = Simulation::new();
    simulation.step(Input {
        shoot: true,
        ..Input::default()
    });
    simulation.step(Input {
        cancel: true,
        ..Input::default()
    });
    for _ in 0..20 {
        simulation.step(Input::default());
    }
    assert_eq!(simulation.charge, 0.0);
    assert_eq!(simulation.ball.velocity, Vec3::ZERO);
}

#[test]
fn goal_scores_only_inside_goal_mouth_and_outside_ball_bounces() {
    let mut goal = Simulation::new();
    goal.ball.position = Vec3::new(45.9, 0.5, 0.0);
    goal.ball.velocity = Vec3::new(30.0, 0.0, 0.0);
    goal.step(Input::default());
    assert_eq!(goal.goals, 1);
    assert_eq!(goal.ball.position, Vec3::new(0.0, 0.11, 0.0));
    assert!((goal.player.position.x - goal.ball.position.x).abs() < 1.0);

    let mut slow_goal = Simulation::new();
    slow_goal.ball.position = Vec3::new(45.8, 0.11, 0.0);
    slow_goal.ball.velocity = Vec3::new(5.0, 0.0, 0.0);
    for _ in 0..120 {
        slow_goal.step(Input::default());
        if slow_goal.goals == 1 {
            break;
        }
    }
    assert_eq!(slow_goal.goals, 1);

    let mut wide = Simulation::new();
    wide.ball.position = Vec3::new(45.8, 0.5, 5.0);
    wide.ball.velocity = Vec3::new(30.0, 0.0, 0.0);
    wide.step(Input::default());
    assert_eq!(wide.goals, 0);
    assert!(wide.ball.position.x < 46.0);
    assert!(wide.ball.velocity.x < 0.0);
}

#[test]
fn loaded_ground_pass_reaches_teammate_and_domain_counts_once() {
    let mut simulation = Simulation::new();
    let teammate_start = simulation.teammate.position;
    for _ in 0..30 {
        simulation.step_actions(Input::default(), true, false);
    }
    assert!(simulation.charge > 0.0);
    simulation.step_actions(Input::default(), false, false);

    let mut received = false;
    for _ in 0..360 {
        simulation.step_actions(Input::default(), false, false);
        assert!(finite_state(&simulation));
        if simulation.passes_completed > 0 {
            received = true;
            break;
        }
    }
    assert!(received, "teammate never made a real contact with the pass");
    assert_eq!(simulation.passes_completed, 1);
    assert_ne!(simulation.teammate.position, teammate_start);
    assert!(simulation.possession == Some(1) || simulation.possession == Some(0));
    if simulation.possession == Some(1) {
        assert!(horizontal_speed(simulation.teammate.velocity) <= f32::EPSILON);
    }
    for _ in 0..240 {
        simulation.step_actions(Input::default(), false, false);
    }
    assert!(simulation.passes_completed <= 2);
}

#[test]
fn possession_leaves_reach_and_loose_ball_can_be_contested() {
    let mut simulation = Simulation::new();
    for _ in 0..30 {
        simulation.step_actions(Input::default(), true, false);
    }
    simulation.step_actions(Input::default(), false, false);
    for _ in 0..48 {
        simulation.step_actions(Input::default(), false, false);
        if simulation.ball.velocity.x > 3.0 && simulation.possession.is_none() {
            break;
        }
    }
    for _ in 0..32 {
        if !simulation.pose().striking {
            break;
        }
        simulation.step_actions(Input::default(), false, false);
    }

    // Simulate a stale controlled-possession claim after the pass has started.
    // The next tick must release it instead of pulling the ball back to the user.
    simulation.possession = Some(0);
    simulation.player.position = Vec3::new(
        simulation.ball.position.x + 3.0,
        0.0,
        simulation.ball.position.z,
    );
    simulation.teammate.position = Vec3::new(
        simulation.ball.position.x + 3.0,
        0.0,
        simulation.ball.position.z + 3.0,
    );
    simulation.defender.position =
        Vec3::new(simulation.ball.position.x, 0.0, simulation.ball.position.z);
    simulation.defender.velocity = Vec3::ZERO;
    simulation.step_actions(Input::default(), false, false);
    assert_ne!(simulation.possession, Some(0));
    assert_eq!(simulation.possession, Some(2));
    assert!(horizontal_speed(simulation.defender.velocity) <= f32::EPSILON);
}

#[test]
fn pass_cancel_suppresses_release_and_does_not_activate_defender() {
    let mut simulation = Simulation::new();
    for _ in 0..20 {
        simulation.step_actions(Input::default(), true, false);
    }
    simulation.step_actions(
        Input {
            cancel: true,
            ..Input::default()
        },
        true,
        false,
    );
    for _ in 0..60 {
        simulation.step_actions(Input::default(), false, false);
    }
    assert_eq!(simulation.charge, 0.0);
    assert_eq!(simulation.possession, Some(0));
    assert_eq!(simulation.passes_completed, 0);
    assert_eq!(simulation.ball.velocity, Vec3::ZERO);
}

#[test]
fn defender_can_intercept_then_controlled_tackle_needs_reach_and_facing() {
    let mut simulation = Simulation::new();
    simulation.step_actions(Input::default(), true, false);
    for _ in 0..12 {
        simulation.step_actions(Input::default(), true, false);
    }
    simulation.step_actions(Input::default(), false, false);
    for _ in 0..36 {
        simulation.step_actions(Input::default(), false, false);
    }
    assert_eq!(simulation.possession, None);
    simulation.defender.position = simulation.ball.position;
    simulation.defender.velocity = Vec3::ZERO;
    simulation.teammate.position = Vec3::new(
        simulation.ball.position.x + 2.0,
        simulation.ball.position.y,
        simulation.ball.position.z,
    );
    simulation.step_actions(Input::default(), false, false);
    assert_eq!(simulation.possession, Some(2));

    simulation.player.position = Vec3::new(
        simulation.defender.position.x - 0.8,
        simulation.defender.position.y,
        simulation.defender.position.z,
    );
    simulation.ball.position = Vec3::new(
        simulation.defender.position.x,
        0.11,
        simulation.defender.position.z,
    );
    simulation.ball.velocity = Vec3::ZERO;
    simulation.player.velocity = Vec3::ZERO;
    simulation.player.facing = Vec3::new(1.0, 0.0, 0.0);
    for _ in 0..30 {
        simulation.step_actions(Input::default(), false, true);
    }
    assert_eq!(simulation.possession, Some(0));
    assert_eq!(simulation.tackles_won, 1);
}

#[test]
fn tackle_preparation_requires_continuous_reach() {
    let mut simulation = Simulation::new();
    for _ in 0..14 {
        simulation.step_actions(Input::default(), true, false);
    }
    simulation.step_actions(Input::default(), false, false);
    for _ in 0..36 {
        simulation.step_actions(Input::default(), false, false);
    }
    simulation.defender.position = simulation.ball.position;
    simulation.defender.velocity = Vec3::ZERO;
    simulation.teammate.position = Vec3::new(
        simulation.ball.position.x + 2.0,
        0.0,
        simulation.ball.position.z,
    );
    simulation.step_actions(Input::default(), false, false);
    assert_eq!(simulation.possession, Some(2));
    simulation.player.position = Vec3::new(
        simulation.defender.position.x - 0.8,
        0.0,
        simulation.defender.position.z,
    );
    simulation.player.velocity = Vec3::ZERO;
    simulation.player.facing = Vec3::new(1.0, 0.0, 0.0);
    simulation.ball.position = Vec3::new(
        simulation.defender.position.x,
        0.11,
        simulation.defender.position.z,
    );
    simulation.ball.velocity = Vec3::ZERO;

    for _ in 0..10 {
        simulation.step_actions(Input::default(), false, true);
    }
    simulation.step_actions(Input::default(), false, false);
    for _ in 0..26 {
        simulation.step_actions(Input::default(), false, true);
    }
    assert_eq!(simulation.tackles_won, 0);
    assert_eq!(simulation.possession, Some(2));
    simulation.step_actions(Input::default(), false, true);
    assert_eq!(simulation.tackles_won, 1);
    assert_eq!(simulation.possession, Some(0));
}

#[test]
fn two_v_one_state_stays_finite_and_repeats_deterministically() {
    let mut first = Simulation::new();
    let mut second = first.clone();
    for tick in 0..600 {
        let input = Input {
            x: if tick % 90 < 45 { 0.6 } else { -0.2 },
            z: if tick % 120 < 60 { 0.3 } else { -0.4 },
            sprint: tick % 75 < 20,
            shoot: false,
            cancel: false,
        };
        let pass = tick == 30 || (tick > 30 && tick < 52);
        let tackle = tick > 100 && tick % 37 == 0;
        first.step_actions(input, pass, tackle);
        second.step_actions(input, pass, tackle);
        assert_eq!(first, second);
        assert!(finite_state(&first));
        assert!(first.teammate.position.x.is_finite());
        assert!(first.defender.position.z.is_finite());
    }
}

#[test]
fn impulse_matches_foot_contact_and_follow_through_does_not_chase_ball() {
    let mut simulation = Simulation::new();
    for _ in 0..60 {
        simulation.step(Input {
            shoot: true,
            ..Input::default()
        });
    }
    let mut contacts = 0;
    for _ in 0..36 {
        let ball_before = simulation.ball.position;
        let speed_before = horizontal_speed(simulation.ball.velocity);
        simulation.step(Input::default());
        let pose = simulation.pose();
        if horizontal_speed(simulation.ball.velocity) > speed_before + 5.0 {
            contacts += 1;
            let delta = Vec3::new(
                pose.right_foot.x - ball_before.x,
                pose.right_foot.y - ball_before.y,
                pose.right_foot.z - ball_before.z,
            );
            assert!((delta.x * delta.x + delta.y * delta.y + delta.z * delta.z).sqrt() <= 0.27);
        }
        assert!(horizontal_distance(pose.right_foot, simulation.player.position) <= 1.0501);
        assert!(pose.right_foot.y >= 0.05);
    }
    assert_eq!(contacts, 1);
    assert!(!simulation.pose().striking);
}

#[test]
fn pressing_again_during_strike_requires_release_before_rearming() {
    let mut simulation = Simulation::new();
    for _ in 0..30 {
        simulation.step(Input {
            shoot: true,
            ..Input::default()
        });
    }
    simulation.step(Input::default());
    for _ in 0..60 {
        simulation.step(Input {
            shoot: true,
            ..Input::default()
        });
        assert_eq!(simulation.charge, 0.0);
    }
    assert!(!simulation.pose().striking);
    simulation.step(Input::default());
    simulation.step(Input {
        shoot: true,
        ..Input::default()
    });
    assert!(simulation.charge > 0.0);
}

#[test]
fn settled_charge_never_reaccelerates_during_automatic_strike() {
    let mut simulation = Simulation::new();
    for _ in 0..90 {
        simulation.step(Input {
            x: 1.0,
            ..Input::default()
        });
    }
    for _ in 0..60 {
        simulation.step(Input {
            x: 1.0,
            shoot: true,
            ..Input::default()
        });
    }
    let planted = simulation.player.position;
    for _ in 0..180 {
        simulation.step(Input {
            x: 1.0,
            shoot: true,
            ..Input::default()
        });
        assert!(horizontal_speed(simulation.player.velocity) < 0.01);
        assert!(horizontal_distance(planted, simulation.player.position) < 0.01);
    }
}
