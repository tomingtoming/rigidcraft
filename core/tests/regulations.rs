use rigidcraft_core::{Simulation, PhysicsOptions};
use rigidcraft_core::physics::math::to_vector;
use rigidcraft_core::model::Vec3;
const CORE: &str = "Val {} Key {} Body { Core(){} } Lua { function OnFrame() end }";
fn make(gravity: f64) -> Simulation {
 Simulation::load(CORE, PhysicsOptions { gravity, no_course:true, no_ground:true }).unwrap()
}
fn frames(s:&mut Simulation,n:usize){ for _ in 0..n {s.step();} }
#[test]
fn gravity_switch_preserves_velocity_and_restores_configured_gravity() {
 let mut s=make(-4.0);
 s.eval_lua("_SETREG('G',0); _SETREG('A',0)").unwrap();
 let y=s.api("_Y",&[0.0]);frames(&mut s,30);
 assert!((s.api("_Y",&[0.0])-y).abs()<1e-6);
 s.eval_lua("_SETREG('G',1)").unwrap(); frames(&mut s,30);
 assert!((s.api("_VY",&[0.0])+4.0).abs()<0.001);
 s.eval_lua("_SETREG('G',0)").unwrap();frames(&mut s,30);
 assert!((s.api("_VY",&[0.0])+4.0).abs()<0.001);
 s.reset();let y=s.api("_Y",&[0.0]);frames(&mut s,30);
 assert!((s.api("_Y",&[0.0])-y).abs()<1e-6);
}
#[test]
fn air_switch_removes_then_restores_drag_without_stopping_the_body() {
 let mut s=make(0.0);s.eval_lua("_SETREG('A',0)").unwrap();
 { let mut state=s.state_mut();let h=state.world.tiles[0].body; state.world.world.bodies[h].set_linvel(to_vector(Vec3::new(0.0,20.0,0.0)),true); }
 frames(&mut s,30);assert!((s.api("_VY",&[0.0])-20.0).abs()<0.001);
 s.eval_lua("_SETREG('A',1)").unwrap();frames(&mut s,30);
 assert!(s.api("_VY",&[0.0])<10.0);
}
#[test]
fn air_switch_also_controls_water_buoyancy() {
 let mut s=make(0.0);s.state_mut().world.water=Some([-10.0,10.0,-10.0,10.0,10.0]);
 s.eval_lua("_SETREG('A',0)").unwrap();frames(&mut s,10);assert!(s.api("_VY",&[0.0]).abs()<1e-6);
 s.eval_lua("_SETREG('A',1)").unwrap();frames(&mut s,10);assert!(s.api("_VY",&[0.0])>0.1);
 s.eval_lua("_SETREG('A',0)").unwrap();let v=s.api("_VY",&[0.0]);frames(&mut s,10);assert!((s.api("_VY",&[0.0])-v).abs()<1e-6);
}
#[test]
fn gravity_switch_wakes_free_objects() {
 let mut s=make(-9.8);s.eval_lua("_SETREG('G',0)").unwrap();
 let i=s.state_mut().world.add_ball(0.2,3.0,5.0,0.0,1.0);
 frames(&mut s,90);
 let h=s.state().world.balls[i].body;
 let y=s.state().world.world.bodies[h].translation().y;
 s.eval_lua("_SETREG('G',1)").unwrap();frames(&mut s,15);
 assert!(s.state().world.world.bodies[h].translation().y < y-0.5);
}

#[test]
fn measured_speed_ceiling_uses_vector_length_and_leaves_slow_motion_alone() {
 for v in [Vec3::new(30.0,40.0,0.0),Vec3::new(200.0,200.0,200.0)] {
  let mut s=make(0.0);s.eval_lua("_SETREG('A',0); _SETREG('U',1)").unwrap();
  {let mut state=s.state_mut();let h=state.world.tiles[0].body;state.world.world.bodies[h].set_linvel(to_vector(v),true);}
  frames(&mut s,2);let speed=s.api("_VEL",&[0.0]);
  let expected=v.length().min(140.0);assert!((speed-expected).abs()<0.001);
 }
}
#[test]
fn symmetric_jets_match_the_original_acceleration_and_speed_ceiling() {
 for power in [20000,60000] {
  let source=format!("Val {{ POWER(default={power},min=0,max=60000) }} Key {{}} Body {{ Core(){{ N:Jet(power=POWER){{}} S:Jet(power=POWER){{}} }} }} Lua {{ function OnFrame() end }}");
  let mut s=Simulation::load(&source,PhysicsOptions{gravity:0.0,no_course:true,no_ground:true}).unwrap();
  s.eval_lua("_SETREG('A',0); _SETREG('G',0); _SETREG('U',1)").unwrap();
  frames(&mut s,10);
  let predicted=2.0*power as f64/6.0/s.api("_WEIGHT",&[])/3.0;
  assert!((s.api("_VEL",&[0.0])-predicted).abs()<0.01);
  frames(&mut s,120);assert!((s.api("_VEL",&[0.0])-140.0).abs()<0.01);
 }
}

#[test]
fn airborne_wing_drag_matches_the_b26_incidence_sweep() {
    // Same 3,000 N vertical thrust at each angle. The core always faces the
    // flow broadside, so the 0° row measures the baseline with edge-on wings.
    let mut edge_on = 0.0;
    for (incidence, original) in [(0, 20.902), (5, 20.857), (15, 20.217), (45, 15.344), (90, 11.959)] {
        let fold = 90 - incidence;
        let source = format!("Val {{ FOLD(default={fold},min=-90,max=90) }} Key {{}}
            Body {{ Core(){{ N:Jet(power=9000){{}} S:Jet(power=9000){{}}
            W:Chip(angle=FOLD,spring=1,damper=0.5){{}} E:Chip(angle=FOLD,spring=1,damper=0.5){{}} }} }}");
        let mut sim = Simulation::load(&source, PhysicsOptions { no_course: true, ..Default::default() }).unwrap();
        sim.step();
        sim.state_mut().world.regulations.insert("G".into(), 0.0);
        let mut total = 0.0;
        for frame in 2..=120 {
            sim.step();
            if frame >= 100 {
                total += sim.api("_VY", &[0.0]);
            }
        }
        let mean = total / 21.0;
        assert!((mean - original).abs() < 0.3, "{incidence} degrees: {mean}, expected {original}");
        if incidence == 0 { edge_on = mean; }
        if incidence == 5 {
            assert!(((edge_on - mean) - 0.045).abs() < 0.025, "shallow angle increment");
        }
    }
}
