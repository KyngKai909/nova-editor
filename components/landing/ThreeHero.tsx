"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// A lightweight, captivating WebGL backdrop: a slowly rotating wireframe
// icosahedron wrapped in a drifting particle field, with subtle mouse parallax.
// Scales quality down on small screens and respects reduced-motion.
export default function ThreeHero() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.innerWidth < 768;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    );
    camera.position.z = 5;

    // WebGL can be unavailable (no hardware accel, too many live contexts, etc.).
    // Fail gracefully to the CSS gradient background instead of crashing the page.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
        failIfMajorPerformanceCaveat: false,
      });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // also bail if the context is lost at runtime
    renderer.domElement.addEventListener("webglcontextlost", (e) => e.preventDefault());

    const accent = new THREE.Color("#ccff02");
    const white = new THREE.Color("#ffffff");

    // central wireframe icosahedron
    const icoGeo = new THREE.IcosahedronGeometry(1.5, isMobile ? 1 : 2);
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(icoGeo),
      new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.5 })
    );
    const glow = new THREE.Points(
      icoGeo,
      new THREE.PointsMaterial({ color: white, size: 0.05, transparent: true, opacity: 0.9 })
    );
    const core = new THREE.Group();
    core.add(wire, glow);
    scene.add(core);

    // drifting particle field
    const count = isMobile ? 1400 : 3800;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 4 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const fieldGeo = new THREE.BufferGeometry();
    fieldGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const field = new THREE.Points(
      fieldGeo,
      new THREE.PointsMaterial({ color: white, size: 0.018, transparent: true, opacity: 0.55 })
    );
    scene.add(field);

    // mouse parallax
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove);

    let raf = 0;
    const start = performance.now();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = (performance.now() - start) / 1000;
      const speed = reduced ? 0 : 1;
      core.rotation.y = t * 0.18 * speed;
      core.rotation.x = Math.sin(t * 0.25) * 0.25 * speed;
      core.scale.setScalar(1 + Math.sin(t * 0.8) * 0.04 * speed);
      field.rotation.y = -t * 0.03 * speed;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      camera.position.x = mouse.x * 0.6;
      camera.position.y = -mouse.y * 0.6;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      icoGeo.dispose();
      fieldGeo.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 h-full w-full" />;
}
