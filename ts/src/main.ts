namespace demo {

    const e = new THREE.Euler

    const flipQ = new THREE.Quaternion().setFromEuler( e.set(0,Math.PI, 0))

    export function loadGltf( url: string ){
        return new Promise<{
            scene: THREE.Scene
            cameras: THREE.Camera[]
        }>( (resolve, reject)=>{
            new THREE.GLTFLoader().load( url, gltf=>{
                resolve( gltf )
            }, undefined, e=>reject(e))
        })
    }

    function blenderWattsToLumens(watt: number) {
        return (683 * watt) / (4 * Math.PI);
    }

    export class Main {
        static async create( canvas: HTMLCanvasElement ){
            const [sceneGltf, bellSword] = await Promise.all([
                loadGltf("asset/scene/scene.gltf"),
                BellSword.create()
            ])
            
            const scene = sceneGltf.scene
            scene.updateMatrixWorld(true)
            const camera = sceneGltf.cameras[0] as THREE.PerspectiveCamera
            const pivot = scene.getObjectByName("pivot")!
            const light1 = scene.getObjectByName("Light1")!.children[0] as THREE.SpotLight
            const light2 = scene.getObjectByName("Light2")!.children[0] as THREE.SpotLight
            // correct light intensity
            light1.intensity /= 2
            light2.intensity /= 2

            bellSword.object3D.position.set(0,-0.1,0)
            pivot.add( bellSword.object3D )

            return new Main(
                canvas,
                scene,
                camera,
                pivot,
                bellSword
            )
        }

        private renderer: THREE.WebGLRenderer
        private animationFrameRequest = -1
        private time = 0

        constructor(
            canvas: HTMLCanvasElement,
            private scene: THREE.Scene,
            private camera: THREE.PerspectiveCamera,
            private pivot: THREE.Object3D,
            private bellSword: BellSword
        ){
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas
            })
            this.renderer.physicallyCorrectLights = true
            this.renderer.shadowMap.enabled = true
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
            this.renderer.setClearColor(new THREE.Color(0.5,0.5,0.5))

            window.addEventListener( "resize", ()=>this.onResize() )
        }

        init(){
            this.onResize()
            this.start()
        }

        private update( deltaTime: number ){
            this.time += deltaTime

            this.pivot.quaternion.setFromEuler( e.set(
                this.time*Math.PI*2/3,
                0,
                this.time*Math.PI*2/5)
            )
            this.scene.updateMatrixWorld(true)

            this.bellSword.update( deltaTime )

        }

        private render( deltaTime: number ){
            this.animationFrameRequest = requestAnimationFrame( ()=>{
                this.animationFrameRequest = -1

                this.renderer.render( this.scene, this.camera )
            })
        }

        private start(){
            let prevTime = performance.now()
            setInterval( ()=>{
                if( this.animationFrameRequest==-1 ){
                    const curTime =  performance.now()
                    const deltaTime = (curTime-prevTime)/1000
                    this.update( deltaTime )
                    this.render( deltaTime )
                    prevTime = curTime
                }
            }, 10)
        }

        onResize(){
            this.renderer.domElement.width = window.innerWidth
            this.renderer.domElement.height = window.innerHeight
            this.renderer.setSize( window.innerWidth, window.innerHeight )
            this.camera.aspect = window.innerWidth/window.innerHeight
            this.camera.updateProjectionMatrix()
        }
    }


}