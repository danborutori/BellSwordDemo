namespace demo {

    const e = new THREE.Euler
    const v1 = new THREE.Vector3
    const m = new THREE.Matrix4

    export function loadGltf( url: string ){
        return new Promise<{
            scene: THREE.Scene
            cameras: THREE.Camera[]
        }>( (resolve, reject)=>{
            new THREE.GLTFLoader().load( url, gltf=>{

                (gltf.scene as THREE.Scene).traverse(o=>{
                    const mesh = o as THREE.Mesh
                    if( mesh.isMesh ){
                        const mat = mesh.material as THREE.MeshStandardMaterial
                        if( mat.isMeshStandardMaterial ){
                            for( let t of [
                                mat.map,
                                mat.normalMap,
                                mat.roughnessMap
                            ]){
                                if( t ){
                                    t.anisotropy = 4
                                    t.needsUpdate = true
                                }
                            }
                        }
                    }
                })

                resolve( gltf )
            }, undefined, e=>reject(e))
        })
    }

    export class Main {
        static async create( canvas: HTMLCanvasElement, hud: HTMLElement ){
            const [sceneGltf, bellSword] = await Promise.all([
                loadGltf("asset/scene/scene.gltf"),
                BellSword.create()
            ])
            
            const scene = sceneGltf.scene
            scene.updateMatrixWorld(true)
            const camera = sceneGltf.cameras[0] as THREE.PerspectiveCamera
            scene.attach( camera )
            const pivot = scene.getObjectByName("pivot")!
            const light1 = scene.getObjectByName("Light1")!.children[0] as THREE.SpotLight
            const light2 = scene.getObjectByName("Light2")!.children[0] as THREE.SpotLight
            // correct light intensity
            light1.castShadow = true
            light1.intensity /= Math.PI/2
            light2.castShadow = true
            light2.intensity /= Math.PI/2
            
            scene.getObjectByName("Sphere")!.receiveShadow = true

            bellSword.object3D.position.set(0,-0.1,0)
            pivot.add( bellSword.object3D )

            return new Main(
                canvas,
                hud,
                scene,
                camera,
                pivot,
                bellSword
            )
        }

        private renderer: THREE.WebGLRenderer
        private time = 0
        private arGroup = new THREE.Group
        private arCamera = new THREE.PerspectiveCamera()
        private arLight: THREE.Group
        private arStarted = false

        private depthSense = new DepthSense()

        constructor(
            canvas: HTMLCanvasElement,
            private hud: HTMLElement,
            private scene: THREE.Scene,
            private camera: THREE.PerspectiveCamera,
            private pivot: THREE.Object3D,
            private bellSword: BellSword
        ){
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: true,
                alpha: true
            })
            this.renderer.physicallyCorrectLights = true
            this.renderer.shadowMap.enabled = true
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
            this.renderer.setPixelRatio( window.devicePixelRatio )
            this.renderer.setClearColor(new THREE.Color(0.5,0.5,0.5), 0)
            this.renderer.xr.enabled = true

            const orbitCtrl = new THREE.OrbitControls(camera, this.hud)
            orbitCtrl.minDistance = 0.5
            orbitCtrl.maxDistance = 2
            orbitCtrl.update()

            this.arLight = new THREE.XREstimatedLight( this.renderer )
            const dirLit: THREE.DirectionalLight = this.arLight.directionalLight
            dirLit.castShadow = true
            dirLit.shadow.camera.near = 0.1
            dirLit.shadow.camera.far = 5
            dirLit.shadow.camera.left = -1
            dirLit.shadow.camera.right = 1
            dirLit.shadow.camera.top = 1
            dirLit.shadow.camera.bottom = -1
            dirLit.shadow.mapSize.set(512,512)

            this.arGroup.add( this.arCamera )
            this.depthSense.mesh.position.set(0,0,-2)
            this.arCamera.add( this.depthSense.mesh )
            this.scene.add( this.arGroup )
            this.arGroup.visible = false

            window.addEventListener( "resize", ()=>this.onResize() )
        }

        init(){
            this.onResize()
            this.start()

            const arButton = new ARButton(
                this.renderer,
                this.hud,
                ()=>{
                    this.onArStart()
                },
                ()=>{
                    this.onArEnd()
                }
            )

            this.hud.appendChild( arButton.htmlElement )
            arButton.htmlElement.style.padding = "5"
            arButton.htmlElement.style.position = "absolute"
            arButton.htmlElement.style.left = "50%"
            arButton.htmlElement.style.top = "5"
            arButton.htmlElement.style.transform = "translate( -50%, 0 )"

            const controller = this.renderer.xr.getController(0)
            controller.addEventListener("select", ()=>{
                this.arGroupPositionNeedUpdate = true
            })
            this.scene.add( controller )

            this.renderer.setAnimationLoop( (_, frame)=>{
                this.render(frame)
            })
        }

        private onArStart(){
            this.scene.getObjectByName("notAr")!.visible = false
            this.scene.add(this.arLight)
            this.arGroup.visible = true
            this.arStarted = true
            this.arGroup.position.setScalar(0)   // get closer
            this.arCamera.position.setScalar(0)
            this.arCamera.quaternion.identity()
            this.arCamera.scale.setScalar(1)
            this.arGroupPositionNeedUpdate = true
            this.hitTestSourceRequested = false
        }

        private onArEnd(){
            this.scene.remove(this.arLight)
            this.scene.getObjectByName("notAr")!.visible = true
            this.arGroup.visible = false
            this.arStarted = false
            this.hitTestSource = undefined
            this.pivot.position.setScalar(0)
        }

        private update( deltaTime: number ){
            this.time += deltaTime

            this.pivot.quaternion.setFromEuler( e.set(
                this.time*Math.PI*2/6,
                0,
                this.time*Math.PI*2/10)
            )
            this.scene.updateMatrixWorld(true)

            this.bellSword.update( deltaTime )
        }

        private render( frame: XRFrame ){
            if( frame )
                this.depthSense.senseDepth(this.renderer, frame, this.arCamera, this.arLight.lightProbe)

            if( this.arStarted ){
                this.renderer.render( this.scene, this.arCamera )
            }else{
                this.camera.lookAt(0,0,0)
                this.renderer.render( this.scene, this.camera )
            }

            this.hitTest( frame )
        }

        private arGroupPositionNeedUpdate = true
        private hitTestSourceRequested = false
        private hitTestSource?: XRHitTestSource
        private hitTest( frame: XRFrame ){
            if( this.arGroupPositionNeedUpdate ){
                const currentSession = this.renderer.xr.getSession()
                const refSpace = this.renderer.xr.getReferenceSpace()
                if( refSpace && currentSession ){
                    if( !this.hitTestSourceRequested ){                        
                        this.hitTestSourceRequested = true
                        currentSession.requestReferenceSpace("viewer").then( refSpace=>{
                            if( currentSession.requestHitTestSource){
                                currentSession.requestHitTestSource({
                                    space: refSpace
                                })!.then( source=>{
                                    this.hitTestSource = source
                                })
                            }
                        })
                    }

                    if( this.hitTestSource ){
                        const results = frame.getHitTestResults(this.hitTestSource)

                        if(results.length>0){
                            const r = results[0]
                            const pose = r.getPose(refSpace)
                            if( pose ){
                                m.fromArray( pose.transform.matrix )
                                this.pivot.position.setFromMatrixPosition(m)
                                .addScaledVector(
                                    v1.setFromMatrixColumn(m,1),
                                    0.2
                                )
                                this.arLight.position.copy(this.pivot.position)

                                this.arGroupPositionNeedUpdate = false
                            }
                        }
                    }
                }
            }
        }

        private start(){
            let prevTime = performance.now()
            setInterval( ()=>{
                const curTime =  performance.now()
                const deltaTime = (curTime-prevTime)/1000
                this.update( deltaTime )
                prevTime = curTime
            }, 10)
        }

        onResize(){
            this.renderer.domElement.width = window.innerWidth
            this.renderer.domElement.height = window.innerHeight
            if( !this.arStarted )
                this.renderer.setSize( window.innerWidth, window.innerHeight )
            this.camera.aspect = window.innerWidth/window.innerHeight
            this.camera.updateProjectionMatrix()
        }
    }


}