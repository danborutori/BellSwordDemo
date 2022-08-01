namespace demo {

    const e = new THREE.Euler
    const m = new THREE.Quaternion

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
        private arStarted = false

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

            this.arGroup.add( this.arCamera )
            this.scene.add( this.arGroup )

            window.addEventListener( "resize", ()=>this.onResize() )
        }

        init(){
            this.onResize()
            this.start()

            const arButton = new ARButton(
                this.renderer,
                this.hud,
                ()=>{
                    this.scene.getObjectByName("Sphere")!.visible = false
                    this.arStarted = true
                    this.camera.matrixWorld.decompose(this.arGroup.position, this.arGroup.quaternion, this.arGroup.scale)
                    this.arCamera.position.setScalar(0)
                    this.arCamera.quaternion.identity()
                    this.arCamera.scale.setScalar(1)
                },
                ()=>{
                    this.scene.getObjectByName("Sphere")!.visible = true
                    this.arStarted = false
                }
            )

            this.hud.appendChild( arButton.htmlElement )
            arButton.htmlElement.style.padding = "5"
            arButton.htmlElement.style.position = "absolute"
            arButton.htmlElement.style.left = "50%"
            arButton.htmlElement.style.top = "5"
            arButton.htmlElement.style.transform = "translate( -50%, 0 )"

            this.renderer.setAnimationLoop( ()=>{
                if( this.arStarted ){
                    this.renderer.render( this.scene, this.arCamera )
                }else{
                    this.camera.lookAt(0,0,0)
                    this.renderer.render( this.scene, this.camera )
                }
            })
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