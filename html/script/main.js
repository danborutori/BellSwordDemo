"use strict";
var demo;
(function (demo) {
    const v1 = new THREE.Vector3;
    const v2 = new THREE.Vector3;
    const m1 = new THREE.Matrix4;
    const unitY = new THREE.Vector3(0, 1, 0);
    const gravity = -9.8;
    const reboundForce = 5000;
    const edgeReboundForce = 25000;
    const dampingFactor = 20;
    const spacing = 0.01;
    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }
    let cachedGeometry;
    function createGeometry(swordGeometry, coinGeometries) {
        if (!cachedGeometry) {
            function setSkinWeight(g, id) {
                const count = g.attributes.position.count;
                const skinIndex = new THREE.BufferAttribute(new Float32Array(count * 4), 4);
                const skinWeight = new THREE.BufferAttribute(new Float32Array(count * 4), 4);
                for (let i = 0; i < count; i++) {
                    skinIndex.setXYZW(i, id, 0, 0, 0);
                    skinWeight.setXYZW(i, 1, 0, 0, 0);
                }
                g.setAttribute("skinIndex", skinIndex);
                g.setAttribute("skinWeight", skinWeight);
            }
            const g = new Array(21);
            g[0] = swordGeometry.clone();
            setSkinWeight(g[0], 0);
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < coinGeometries.length; j++) {
                    const idx = i * coinGeometries.length + j + 1;
                    const _g = coinGeometries[j].clone();
                    setSkinWeight(_g, idx);
                    g[idx] = _g;
                }
            }
            cachedGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries(g);
        }
        return cachedGeometry;
    }
    class BellSword {
        constructor(object3D, boneRoot, paths) {
            this.object3D = object3D;
            this.boneRoot = boneRoot;
            this.paths = paths.map(p => {
                const nodes = p.nodes.map((position, i) => {
                    const idx0 = Math.min(i, p.nodes.length - 2);
                    const idx1 = idx0 + 1;
                    return {
                        position: position,
                        direction: new THREE.Vector3().subVectors(p.nodes[idx1], p.nodes[idx0]).normalize()
                    };
                });
                return {
                    nodes: nodes,
                    length: nodes.reduce((a, b, i) => {
                        if (i + 1 < nodes.length)
                            return a + v1.subVectors(nodes[i].position, nodes[i + 1].position).length();
                        else
                            return a;
                    }, 0),
                    coins: p.bones.map((m, i) => {
                        return {
                            fraction: (i + 0.5) / p.bones.length,
                            velocity: 0,
                            bone: m
                        };
                    })
                };
            });
        }
        static create() {
            const modelLoader = new THREE.GLTFLoader();
            return new Promise((resolve, reject) => {
                modelLoader.load("asset/bell_sword/bell_sword.gltf", gltf => {
                    const scene = gltf.scene;
                    const swordMesh = scene.getObjectByName("bell_sword");
                    const bigPathNodesL = new Array(8);
                    const smallPathNodesL = new Array(4);
                    for (let i = 0; i < bigPathNodesL.length; i++) {
                        const o = scene.getObjectByName(`path${i}`);
                        swordMesh.remove(o);
                        bigPathNodesL[i] = o.position.clone();
                    }
                    for (let i = 0; i < smallPathNodesL.length; i++) {
                        const o = scene.getObjectByName(`paths${i + 1}`);
                        swordMesh.remove(o);
                        smallPathNodesL[i] = o.position.clone();
                    }
                    const bigPathNodesR = bigPathNodesL.map(v => new THREE.Vector3(-v.x, v.y, v.z));
                    const smallPathNodesR = smallPathNodesL.map(v => new THREE.Vector3(-v.x, v.y, v.z));
                    const coins = new Array(5);
                    for (let i = 0; i < coins.length; i++) {
                        coins[i] = scene.getObjectByName(`coin_${i + 1}`);
                    }
                    const bones = new Array(21);
                    for (let i = 0; i < bones.length; i++) {
                        bones[i] = new THREE.Bone();
                        if (i > 0) {
                            bones[0].add(bones[i]);
                        }
                    }
                    const skeleton = new THREE.Skeleton(bones);
                    const mesh = new THREE.SkinnedMesh(createGeometry(swordMesh.geometry, coins.map(c => c.geometry)), swordMesh.material);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.frustumCulled = true;
                    mesh.bind(skeleton);
                    resolve(new BellSword(mesh, skeleton.bones[0], [
                        {
                            nodes: bigPathNodesL,
                            bones: skeleton.bones.slice(1, 6)
                        },
                        {
                            nodes: bigPathNodesR,
                            bones: skeleton.bones.slice(6, 11)
                        },
                        {
                            nodes: smallPathNodesL,
                            bones: skeleton.bones.slice(11, 16)
                        },
                        {
                            nodes: smallPathNodesR,
                            bones: skeleton.bones.slice(16, 21)
                        }
                    ]));
                }, undefined, e => reject(e));
            });
        }
        simulate(deltaTime) {
            m1.copy(this.object3D.matrixWorld).invert();
            const localGravity = v1.set(0, 1, 0).transformDirection(m1).multiplyScalar(gravity);
            const substep = 5;
            const subDeltaTime = Math.min(1 / 30, deltaTime) / substep;
            for (let j = 0; j < substep; j++) {
                for (let p of this.paths) {
                    for (let i = 0; i < p.coins.length; i++) {
                        const c = p.coins[i];
                        const idx = c.fraction * p.nodes.length;
                        const idx0 = clamp(Math.floor(idx), 0, p.nodes.length - 2);
                        const idx1 = idx0 + 1;
                        const fract = idx - idx0;
                        const direction = v2.lerpVectors(p.nodes[idx0].direction, p.nodes[idx1].direction, fract).normalize();
                        let linearForce = direction.dot(localGravity);
                        linearForce /= p.length;
                        let neighbourForce = 0;
                        const relSpac = spacing / p.length;
                        if (i - 1 >= 0) {
                            neighbourForce += Math.max(p.coins[i - 1].fraction - c.fraction + relSpac, 0) * reboundForce;
                        }
                        if (i + 1 < p.coins.length) {
                            neighbourForce += Math.min(p.coins[i + 1].fraction - c.fraction - relSpac, 0) * reboundForce;
                        }
                        linearForce += neighbourForce;
                        linearForce += edgeReboundForce * Math.max(0, -c.fraction);
                        linearForce += edgeReboundForce * Math.min(0, 1 - c.fraction);
                        linearForce += -c.velocity * dampingFactor;
                        c.velocity += linearForce * subDeltaTime;
                        c.fraction += c.velocity * subDeltaTime;
                    }
                }
            }
        }
        update(deltaTime) {
            this.simulate(deltaTime);
            for (let p of this.paths) {
                for (let i = 0; i < p.coins.length; i++) {
                    const c = p.coins[i];
                    const idx = c.fraction * p.nodes.length;
                    const idx0 = clamp(Math.floor(idx), 0, p.nodes.length - 2);
                    const idx1 = idx0 + 1;
                    const fract = idx - idx0;
                    const n0 = p.nodes[idx0];
                    const n1 = p.nodes[idx1];
                    c.bone.position.lerpVectors(n0.position, n1.position, fract),
                        c.bone.quaternion.setFromUnitVectors(unitY, v1.lerpVectors(n0.direction, n1.direction, fract));
                }
            }
            this.boneRoot.position.set(0, 0, 0);
            this.boneRoot.quaternion.identity();
            this.boneRoot.applyMatrix4(this.object3D.matrixWorld);
            this.boneRoot.updateMatrixWorld();
        }
    }
    demo.BellSword = BellSword;
})(demo || (demo = {}));
var demo;
(function (demo) {
    const e = new THREE.Euler;
    function createScene() {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera();
        const material = new THREE.MeshStandardMaterial({
            side: THREE.FrontSide,
            shadowSide: THREE.BackSide
        });
        const floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(100, 100).rotateX(-Math.PI / 2), material);
        floor.castShadow = true;
        floor.receiveShadow = true;
        const light = new THREE.SpotLight();
        light.castShadow = true;
        light.angle = Math.PI / 12;
        light.penumbra = 0.5;
        scene.add(camera);
        scene.add(floor);
        scene.add(light);
        camera.position.set(0, 1, -0.5);
        camera.lookAt(0, 0.5, 0);
        light.position.set(1, 3, -2);
        light.lookAt(0, 0.5, 0);
        return {
            scene: scene,
            camera: camera
        };
    }
    class Main {
        constructor(canvas) {
            this.animationFrameRequest = -1;
            this.pivot = new THREE.Object3D;
            this.time = 0;
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas
            });
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.setClearColor(new THREE.Color(0, 0, 0));
            const s = createScene();
            this.scene = s.scene;
            this.camera = s.camera;
            this.pivot.position.set(0, 0.5, 0);
            this.scene.add(this.pivot);
            window.addEventListener("resize", () => this.onResize());
        }
        init() {
            this.onResize();
            this.start();
            demo.BellSword.create().then(bs => {
                bs.object3D.position.set(0, -0.1, 0);
                this.pivot.add(bs.object3D);
                this.bellSword = bs;
            });
        }
        update(deltaTime) {
            this.time += deltaTime;
            this.pivot.quaternion.setFromEuler(e.set(this.time * Math.PI * 2 / 3, 0, this.time * Math.PI * 2 / 5));
            if (this.bellSword) {
                this.bellSword.update(deltaTime);
            }
        }
        render(deltaTime) {
            this.animationFrameRequest = requestAnimationFrame(() => {
                this.animationFrameRequest = -1;
                this.renderer.render(this.scene, this.camera);
            });
        }
        start() {
            let prevTime = performance.now();
            setInterval(() => {
                if (this.animationFrameRequest == -1) {
                    const curTime = performance.now();
                    const deltaTime = (curTime - prevTime) / 1000;
                    this.update(deltaTime);
                    this.render(deltaTime);
                    prevTime = curTime;
                }
            }, 10);
        }
        onResize() {
            this.renderer.domElement.width = window.innerWidth;
            this.renderer.domElement.height = window.innerHeight;
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        }
    }
    demo.Main = Main;
})(demo || (demo = {}));
