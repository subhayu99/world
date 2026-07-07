// Blueprint 3D primitives — the shared vocabulary of the reskin.
// Everything renders as solid dark faces (for occlusion) + crisp edge lines.
// Rebuild crews compose scenes from these; do not fork private variants.

import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { BLUEPRINT } from './palette';

interface Vec3Props {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
}

/** Edge lines for any geometry. thresholdAngle keeps curved silhouettes clean. */
export function Edges({ geometry, color = BLUEPRINT.line, opacity = 1, threshold = 15 }: {
  geometry: THREE.BufferGeometry;
  color?: string;
  opacity?: number;
  threshold?: number;
}) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, threshold), [geometry, threshold]);
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
    [color, opacity],
  );
  return <lineSegments geometry={edges} material={material} />;
}

/** Solid-but-dark box that occludes, outlined in pale edge lines. */
export function BlueprintBox({ args, color, lineColor, lineOpacity = 1, children, ...t }: Vec3Props & {
  args: [number, number, number];
  color?: string;
  lineColor?: string;
  lineOpacity?: number;
  children?: ReactNode;
}) {
  const geometry = useMemo(() => new THREE.BoxGeometry(...args), [args[0], args[1], args[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group {...t}>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={color ?? BLUEPRINT.face} />
      </mesh>
      <Edges geometry={geometry} color={lineColor ?? BLUEPRINT.line} opacity={lineOpacity} />
      {children}
    </group>
  );
}

/** Cylinder variant (lamp arms, bollards, tubes). */
export function BlueprintCylinder({ args, color, lineColor, lineOpacity = 1, ...t }: Vec3Props & {
  args: [number, number, number, number?]; // rTop, rBottom, h, radialSegments
  color?: string;
  lineColor?: string;
  lineOpacity?: number;
}) {
  const geometry = useMemo(
    () => new THREE.CylinderGeometry(args[0], args[1], args[2], args[3] ?? 12),
    [args[0], args[1], args[2], args[3]], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <group {...t}>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={color ?? BLUEPRINT.face} />
      </mesh>
      <Edges geometry={geometry} color={lineColor ?? BLUEPRINT.line} opacity={lineOpacity} threshold={30} />
    </group>
  );
}

/** Dashed construction line between 3D points (dimension lines, guides). */
export function DashedLine({ points, color = BLUEPRINT.lineDim, dashSize = 0.18, gapSize = 0.12 }: {
  points: [number, number, number][];
  color?: string;
  dashSize?: number;
  gapSize?: number;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
    return g;
  }, [points]);
  const material = useMemo(
    () => new THREE.LineDashedMaterial({ color, dashSize, gapSize, transparent: true }),
    [color, dashSize, gapSize],
  );
  const line = useMemo(() => {
    const l = new THREE.Line(geometry, material);
    l.computeLineDistances();
    return l;
  }, [geometry, material]);
  return <primitive object={line} />;
}

/** Folded paper plane (the Journey vehicle + a recurring motif).
 * ~6 triangles, light faces + edges; nose points -Z. */
export function paperPlaneGeometry(): THREE.BufferGeometry {
  // vertices: nose, tail-center-top, left wingtip, right wingtip, keel bottom
  const nose: [number, number, number] = [0, 0, -1.2];
  const tailTop: [number, number, number] = [0, 0.16, 0.8];
  const leftTip: [number, number, number] = [-0.9, 0.02, 0.75];
  const rightTip: [number, number, number] = [0.9, 0.02, 0.75];
  const keel: [number, number, number] = [0, -0.28, 0.55];
  const tris: [number, number, number][][] = [
    [nose, tailTop, leftTip], // left wing
    [nose, rightTip, tailTop], // right wing
    [nose, keel, tailTop], // keel left face
    [nose, tailTop, keel], // keel right face (backface for double-sided look)
  ];
  const positions: number[] = [];
  tris.forEach((t) => t.forEach((v) => positions.push(...v)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

export function PaperPlane({ accent = false, tone = '#e3e0d7', ...t }: Vec3Props & { accent?: boolean; tone?: string }) {
  const geometry = useMemo(paperPlaneGeometry, []);
  return (
    <group {...t}>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={accent ? BLUEPRINT.accent : tone} side={THREE.DoubleSide} />
      </mesh>
      <Edges geometry={geometry} color={BLUEPRINT.line} threshold={5} />
    </group>
  );
}
