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
        static async create() {
            const gltf = await demo.loadGltf("asset/bell_sword/bell_sword.gltf");
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
            return new BellSword(mesh, skeleton.bones[0], [
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
            ]);
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
    function loadGltf(url) {
        return new Promise((resolve, reject) => {
            new THREE.GLTFLoader().load(url, gltf => {
                resolve(gltf);
            }, undefined, e => reject(e));
        });
    }
    demo.loadGltf = loadGltf;
    class Main {
        constructor(canvas, scene, camera, pivot, bellSword) {
            this.scene = scene;
            this.camera = camera;
            this.pivot = pivot;
            this.bellSword = bellSword;
            this.animationFrameRequest = -1;
            this.time = 0;
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas
            });
            this.renderer.physicallyCorrectLights = true;
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.setClearColor(new THREE.Color(0.5, 0.5, 0.5));
            const orbitCtrl = new THREE.OrbitControls(camera, this.renderer.domElement);
            orbitCtrl.update();
            window.addEventListener("resize", () => this.onResize());
        }
        static async create(canvas) {
            const [sceneGltf, bellSword] = await Promise.all([
                loadGltf("asset/scene/scene.gltf"),
                demo.BellSword.create()
            ]);
            const scene = sceneGltf.scene;
            scene.updateMatrixWorld(true);
            const camera = sceneGltf.cameras[0];
            scene.attach(camera);
            const pivot = scene.getObjectByName("pivot");
            const light1 = scene.getObjectByName("Light1").children[0];
            const light2 = scene.getObjectByName("Light2").children[0];
            light1.castShadow = true;
            light1.intensity /= Math.PI / 2;
            light2.castShadow = true;
            light2.intensity /= Math.PI / 2;
            scene.getObjectByName("Sphere").receiveShadow = true;
            bellSword.object3D.position.set(0, -0.1, 0);
            pivot.add(bellSword.object3D);
            return new Main(canvas, scene, camera, pivot, bellSword);
        }
        init() {
            this.onResize();
            this.start();
        }
        update(deltaTime) {
            this.time += deltaTime;
            this.pivot.quaternion.setFromEuler(e.set(this.time * Math.PI * 2 / 3, 0, this.time * Math.PI * 2 / 5));
            this.scene.updateMatrixWorld(true);
            this.bellSword.update(deltaTime);
        }
        render(deltaTime) {
            this.animationFrameRequest = requestAnimationFrame(() => {
                this.animationFrameRequest = -1;
                this.camera.lookAt(0, 0, 0);
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
