"use strict";
var demo;
(function (demo) {
    class ARButton {
        constructor(renderer, overlay, onSessionStart, onSessionEnd) {
            this.renderer = renderer;
            this.overlay = overlay;
            this.onSessionStart = onSessionStart;
            this.onSessionEnd = onSessionEnd;
            this.htmlElement = document.createElement("input");
            this.isRequesting = false;
            this.htmlElement.type = "button";
            this.htmlElement.value = "AR not supported";
            this.htmlElement.disabled = true;
            this.htmlElement.style.borderRadius = "12px";
            this.htmlElement.style.margin = "5 5 5 5";
            navigator.xr && navigator.xr.isSessionSupported("immersive-ar").then(b => {
                if (b) {
                    this.htmlElement.value = "start AR";
                    this.htmlElement.disabled = false;
                }
            });
            this.htmlElement.addEventListener("click", () => {
                this.htmlElement.disabled = true;
                if (this.currentSession)
                    this.endAr(false);
                else
                    this.startAr();
                this.htmlElement.disabled = false;
            });
        }
        async startAr() {
            if (navigator.xr) {
                if (!this.isRequesting) {
                    this.isRequesting = true;
                    try {
                        const sessionInit = {
                            requiredFeatures: ["dom-overlay", "light-estimation", "depth-sensing"],
                            domOverlay: {
                                root: this.overlay
                            },
                            depthSensing: {
                                usagePreference: ["cpu-optimized", "gpu-optimized"],
                                dataFormatPreference: ["luminance-alpha"],
                            }
                        };
                        this.currentSession = await navigator.xr.requestSession("immersive-ar", sessionInit);
                        this.currentSession.onend = () => {
                            this.endAr(true);
                        };
                        this.renderer.xr.setReferenceSpaceType("local");
                        await this.renderer.xr.setSession(this.currentSession);
                        this.onSessionStart();
                        this.htmlElement.value = "end AR";
                    }
                    catch (e) {
                        console.error(e);
                    }
                    finally {
                        this.isRequesting = false;
                    }
                }
            }
            else {
                console.log("ar is not supported");
            }
        }
        async endAr(alreadyEnd) {
            if (this.currentSession) {
                if (!alreadyEnd)
                    await this.currentSession.end();
                this.onSessionEnd();
                this.currentSession = undefined;
            }
            this.htmlElement.value = "start AR";
        }
    }
    demo.ARButton = ARButton;
})(demo || (demo = {}));
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
    const m = new THREE.Matrix4;
    const v = new THREE.Vector3;
    const c = new THREE.Color;
    const hsl = {
        h: 0,
        s: 0,
        l: 0
    };
    class DepthPlaneMaterial extends THREE.ShadowMaterial {
        constructor() {
            super({
                side: THREE.FrontSide,
                transparent: false,
                depthTest: true,
                depthWrite: true
            });
            this.tDepth = { value: null };
            this.rawValueToMeters = { value: 1 };
            this.cameraNear = { value: 1 };
            const defines = this.defines || (this.defines = {});
            defines.DEPTH_PLANE_MATERIAL = "1";
            this.onBeforeCompile = shader => {
                shader.uniforms.tDepth = this.tDepth;
                shader.uniforms.cameraNear = this.cameraNear;
                shader.uniforms.rawValueToMeters = this.rawValueToMeters;
                shader.vertexShader = `
                    uniform sampler2D tDepth;
                    uniform float cameraNear;
                    uniform float rawValueToMeters;

                    varying float vDepth;
                ` + shader.vertexShader.replace("#include <project_vertex>", `
                    #include <project_vertex>

                    float viewDepth = cameraNear+texture2D( tDepth, 1.0-uv.yx ).r*rawValueToMeters;
                    vDepth = viewDepth;
                    
                    mvPosition.xyz *= abs(viewDepth/mvPosition.z);
                    transformed = (inverse(modelViewMatrix)*mvPosition).xyz;

                    gl_Position = projectionMatrix * mvPosition;
                    `);
            };
        }
    }
    function shGetIrradianceAt(normal, shCoefficients, target) {
        const x = normal.x, y = normal.y, z = normal.z;
        v.copy(shCoefficients[0]).multiplyScalar(0.886227);
        v.addScaledVector(shCoefficients[1], 2.0 * 0.511664 * y);
        v.addScaledVector(shCoefficients[2], 2.0 * 0.511664 * z);
        v.addScaledVector(shCoefficients[3], 2.0 * 0.511664 * x);
        v.addScaledVector(shCoefficients[4], 2.0 * 0.429043 * x * y);
        v.addScaledVector(shCoefficients[5], 2.0 * 0.429043 * y * z);
        v.addScaledVector(shCoefficients[6], (0.743125 * z * z - 0.247708));
        v.addScaledVector(shCoefficients[7], 2.0 * 0.429043 * x * z);
        v.addScaledVector(shCoefficients[8], 0.429043 * (x * x - y * y));
        return target.setRGB(v.x, v.y, v.z);
    }
    class DepthSense {
        constructor() {
            this.depthTexture = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType, THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.LinearFilter, THREE.LinearFilter, 4);
            this.mesh = (() => {
                const m = new THREE.Mesh(new THREE.PlaneBufferGeometry(1, 1, 200, 200), new DepthPlaneMaterial());
                m.receiveShadow = true;
                m.renderOrder = -1;
                return m;
            })();
        }
        senseDepth(renderer, frame, camera, lightProbe) {
            const refSpace = renderer.xr.getReferenceSpace();
            if (refSpace &&
                frame.getDepthInformation) {
                const pose = frame.getViewerPose(refSpace);
                if (pose && pose.views.length > 0) {
                    const view = pose.views[0];
                    const depthInfo = frame.getDepthInformation(view);
                    m.fromArray(view.projectionMatrix);
                    v.set(1, 1, this.mesh.position.z).applyMatrix4(m);
                    this.mesh.scale.set(2 / v.x, 2 / v.y, 1);
                    if (depthInfo) {
                        if (this.depthTexture.image.width != depthInfo.width ||
                            this.depthTexture.image.height != depthInfo.height) {
                            this.depthTexture.dispose();
                            this.depthTexture = new THREE.DataTexture(new Float32Array(depthInfo.width * depthInfo.height), depthInfo.width, depthInfo.height, THREE.RedFormat, THREE.FloatType, THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.LinearFilter, THREE.LinearFilter, 4);
                            this.depthTexture.generateMipmaps = false;
                            this.mesh.material.tDepth.value = this.depthTexture;
                            this.mesh.material.needsUpdate = true;
                        }
                        this.depthTexture.image.data.set(new Uint16Array(depthInfo.data));
                        this.depthTexture.needsUpdate = true;
                        this.mesh.material.cameraNear.value = camera.near;
                        this.mesh.material.rawValueToMeters.value = depthInfo.rawValueToMeters;
                        shGetIrradianceAt(v.set(0, 1, 0), lightProbe.sh.coefficients, c);
                        this.mesh.material.opacity = 1 - c.getHSL(hsl).l;
                    }
                }
            }
        }
    }
    demo.DepthSense = DepthSense;
})(demo || (demo = {}));
var demo;
(function (demo) {
    const e = new THREE.Euler;
    const v1 = new THREE.Vector3;
    function loadGltf(url) {
        return new Promise((resolve, reject) => {
            new THREE.GLTFLoader().load(url, gltf => {
                gltf.scene.traverse(o => {
                    const mesh = o;
                    if (mesh.isMesh) {
                        const mat = mesh.material;
                        if (mat.isMeshStandardMaterial) {
                            for (let t of [
                                mat.map,
                                mat.normalMap,
                                mat.roughnessMap
                            ]) {
                                if (t) {
                                    t.anisotropy = 4;
                                    t.needsUpdate = true;
                                }
                            }
                        }
                    }
                });
                resolve(gltf);
            }, undefined, e => reject(e));
        });
    }
    demo.loadGltf = loadGltf;
    class Main {
        constructor(canvas, hud, scene, camera, pivot, bellSword) {
            this.hud = hud;
            this.scene = scene;
            this.camera = camera;
            this.pivot = pivot;
            this.bellSword = bellSword;
            this.time = 0;
            this.arGroup = new THREE.Group;
            this.arCamera = new THREE.PerspectiveCamera();
            this.arStarted = false;
            this.arGroupPositionSet = 0;
            this.depthSense = new demo.DepthSense();
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: true,
                alpha: true
            });
            this.renderer.physicallyCorrectLights = true;
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setClearColor(new THREE.Color(0.5, 0.5, 0.5), 0);
            this.renderer.xr.enabled = true;
            const orbitCtrl = new THREE.OrbitControls(camera, this.hud);
            orbitCtrl.minDistance = 0.5;
            orbitCtrl.maxDistance = 2;
            orbitCtrl.update();
            this.arLight = new THREE.XREstimatedLight(this.renderer);
            const dirLit = this.arLight.directionalLight;
            dirLit.castShadow = true;
            dirLit.shadow.camera.near = 0.1;
            dirLit.shadow.camera.far = 5;
            dirLit.shadow.camera.left = -1;
            dirLit.shadow.camera.right = 1;
            dirLit.shadow.camera.top = 1;
            dirLit.shadow.camera.bottom = -1;
            dirLit.shadow.mapSize.set(512, 512);
            this.arGroup.add(this.arCamera);
            this.depthSense.mesh.position.set(0, 0, -2);
            this.arCamera.add(this.depthSense.mesh);
            this.scene.add(this.arGroup);
            this.arGroup.visible = false;
            window.addEventListener("resize", () => this.onResize());
        }
        static async create(canvas, hud) {
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
            return new Main(canvas, hud, scene, camera, pivot, bellSword);
        }
        init() {
            this.onResize();
            this.start();
            const arButton = new demo.ARButton(this.renderer, this.hud, () => {
                this.scene.getObjectByName("notAr").visible = false;
                this.scene.add(this.arLight);
                this.arGroup.visible = true;
                this.arStarted = true;
                this.arGroupPositionSet = 5;
                this.camera.matrixWorld.decompose(this.arGroup.position, this.arGroup.quaternion, this.arGroup.scale);
                this.arGroup.position.divideScalar(2);
                this.arCamera.position.setScalar(0);
                this.arCamera.quaternion.identity();
                this.arCamera.scale.setScalar(1);
            }, () => {
                this.scene.remove(this.arLight);
                this.scene.getObjectByName("notAr").visible = true;
                this.arGroup.visible = false;
                this.arStarted = false;
            });
            this.hud.appendChild(arButton.htmlElement);
            arButton.htmlElement.style.padding = "5";
            arButton.htmlElement.style.position = "absolute";
            arButton.htmlElement.style.left = "50%";
            arButton.htmlElement.style.top = "5";
            arButton.htmlElement.style.transform = "translate( -50%, 0 )";
            this.renderer.setAnimationLoop((_, frame) => {
                if (frame)
                    this.depthSense.senseDepth(this.renderer, frame, this.arCamera, this.arLight.lightProbe);
                if (this.arStarted) {
                    this.renderer.render(this.scene, this.arCamera);
                }
                else {
                    this.camera.lookAt(0, 0, 0);
                    this.renderer.render(this.scene, this.camera);
                }
                if (this.arGroupPositionSet > 0) {
                    v1.setFromMatrixColumn(this.arCamera.matrixWorld, 2);
                    this.arGroup.position.setFromMatrixPosition(this.bellSword.object3D.matrixWorld)
                        .addScaledVector(v1, 0.3);
                    --this.arGroupPositionSet;
                }
            });
        }
        update(deltaTime) {
            this.time += deltaTime;
            this.pivot.quaternion.setFromEuler(e.set(this.time * Math.PI * 2 / 6, 0, this.time * Math.PI * 2 / 10));
            this.scene.updateMatrixWorld(true);
            this.bellSword.update(deltaTime);
        }
        start() {
            let prevTime = performance.now();
            setInterval(() => {
                const curTime = performance.now();
                const deltaTime = (curTime - prevTime) / 1000;
                this.update(deltaTime);
                prevTime = curTime;
            }, 10);
        }
        onResize() {
            this.renderer.domElement.width = window.innerWidth;
            this.renderer.domElement.height = window.innerHeight;
            if (!this.arStarted)
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        }
    }
    demo.Main = Main;
})(demo || (demo = {}));
