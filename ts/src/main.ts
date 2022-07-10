namespace demo {

    const e = new THREE.Euler

    function createScene(){
        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera()
        const material = new THREE.MeshStandardMaterial({
            side: THREE.FrontSide,
            shadowSide: THREE.BackSide
        })
        const floor = new THREE.Mesh( new THREE.PlaneBufferGeometry(100,100).rotateX(-Math.PI/2), material )
        floor.castShadow = true
        floor.receiveShadow = true
        const light = new THREE.SpotLight()
        light.castShadow = true
        light.angle = Math.PI/12
        light.penumbra = 0.5

        scene.add( camera )
        scene.add( floor )
        scene.add( light )

        camera.position.set( 0,1,-0.5 )
        camera.lookAt( 0, 0.5, 0 )

        light.position.set( 1, 3, -2 )
        light.lookAt( 0, 0.5, 0 )

        return {
            scene: scene,
            camera: camera
        }
    }

    export class Main {
        private renderer: THREE.WebGLRenderer
        private animationFrameRequest = -1
        private scene: THREE.Scene
        private camera: THREE.PerspectiveCamera
        private pivot = new THREE.Object3D
        private bellSword?: BellSword
        private time = 0

        constructor( canvas: HTMLCanvasElement ){
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas
            })
            this.renderer.shadowMap.enabled = true
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
            this.renderer.setClearColor(new THREE.Color(0,0,0))

            const s = createScene()
            this.scene = s.scene
            this.camera = s.camera
            this.pivot.position.set(0,0.5,0)
            this.scene.add( this.pivot )
            window.addEventListener( "resize", ()=>this.onResize() )
        }

        init(){
            this.onResize()
            this.start()

            BellSword.create().then( bs=>{
                bs.object3D.position.set(0,-0.1,0)
                this.pivot.add( bs.object3D )
                this.bellSword = bs
            } )
        }

        private update( deltaTime: number ){
            this.time += deltaTime

            this.pivot.quaternion.setFromEuler( e.set(
                this.time*Math.PI*2/3,
                0,
                this.time*Math.PI*2/5)
            )

            if( this.bellSword ){
                this.bellSword.update( deltaTime )
            }
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