//! Initial lift in a bank. Match the measured B26 orientation at wind onset.
use snaptiles_core::model::{assemble, refresh_joint_frames, Quat, Vec3};
use snaptiles_core::physics::math::to_vector;
use snaptiles_core::physics::{BuildOptions, World};
use snaptiles_core::rc::parse_rc;
use snaptiles_core::PhysicsOptions;
fn main() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    assert_eq!(args.len(), 9, "model qx qy qz qw wind_z vx vy vz");
    let arg = |i: usize| args[i].parse::<f64>().unwrap();
    let model = parse_rc(&std::fs::read_to_string(&args[0]).unwrap()).unwrap();
    let env = |_: &str| None;
    let mut assembly = assemble(&model, &env).unwrap().unwrap();
    let rotation = Quat {
        x: arg(1),
        y: -arg(2),
        z: -arg(3),
        w: arg(4),
    };
    let origin = assembly.tiles[0].position;
    for tile in &mut assembly.tiles {
        tile.position = tile
            .position
            .sub(origin)
            .apply_quat(rotation)
            .add(Vec3::new(0.0, 100.0, 0.0));
        tile.quaternion = Quat::mul(rotation, tile.quaternion);
    }
    for i in 0..assembly.tiles.len() {
        refresh_joint_frames(&mut assembly.tiles, i);
    }
    let mut world = World::new(PhysicsOptions {
        gravity: 0.0,
        no_course: true,
        no_ground: true,
    });
    world.build(
        assembly,
        &env,
        Vec3::default(),
        BuildOptions {
            in_place: true,
            velocities: None,
        },
    );
    world.wind = Vec3::new(0.0, 0.0, arg(5));
    for (_, body) in world.world.bodies.iter_mut() {
        body.set_linvel(to_vector(Vec3::new(-arg(6), arg(7), arg(8))), true);
    }
    println!("frame,x,y,z");
    for frame in 0..=60 {
        let mut sum = Vec3::default();
        let mut mass = 0.0;
        for (i, body) in world.tiles.iter().enumerate() {
            let m = world.assembly().unwrap().tiles[body.tile].mass;
            sum = sum.add(world.pose(i).position.scale(m));
            mass += m;
        }
        let p = sum.scale(1.0 / mass);
        println!("{frame},{},{},{}", -p.x, p.y, p.z);
        for _ in 0..2 {
            world.apply_controls(&env);
            world.step(&env);
        }
    }
}
