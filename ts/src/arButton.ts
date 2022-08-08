namespace demo {

    export class ARButton {
        readonly htmlElement = document.createElement( "input" )

        private currentSession?: XRSession

        constructor(
            readonly renderer: THREE.WebGLRenderer,
            readonly overlay: HTMLElement,
            private onSessionStart: ()=>void,
            private onSessionEnd: ()=>void
        ){
            this.htmlElement.type = "button"
            this.htmlElement.value = "AR not supported"
            this.htmlElement.disabled = true
            navigator.xr && navigator.xr.isSessionSupported("immersive-ar").then(b=>{
                if( b ){
                    this.htmlElement.value = "start AR"
                    this.htmlElement.disabled = false
                }
            })

            this.htmlElement.addEventListener( "click", ()=>{
                this.htmlElement.disabled = true
                if( this.currentSession )
                    this.endAr(false)
                else
                    this.startAr()
                this.htmlElement.disabled = false
            })

        }

        private isRequesting = false
        private async startAr(){

            if( navigator.xr ){
                if( !this.isRequesting ){
                    this.isRequesting = true
                    try{
                        const sessionInit = {
                            requiredFeatures: ["dom-overlay", "light-estimation", "depth-sensing"],
                            domOverlay: {
                                root: this.overlay
                            },
                            depthSensing: {
                                usagePreference: ["cpu-optimized", "gpu-optimized"],
                                dataFormatPreference: ["luminance-alpha"],
                            }
                        }
                        this.currentSession = await navigator.xr.requestSession("immersive-ar", sessionInit)
                        this.currentSession.onend = ()=>{
                            this.endAr( true )
                        }

                        this.renderer.xr.setReferenceSpaceType("local")
                        await this.renderer.xr.setSession(this.currentSession)

                        this.onSessionStart()

                        this.htmlElement.value = "end AR"
                    }catch(e){
                        console.error(e)
                    }finally{
                        this.isRequesting = false
                    }
                }
            }else{
                console.log("ar is not supported")
            }
        }

        private async endAr( alreadyEnd: boolean ){            
            if( this.currentSession ){
                if( !alreadyEnd )
                    await this.currentSession.end()
                this.onSessionEnd()
                this.currentSession = undefined
            }

            this.htmlElement.value = "start AR"
        }
    }

}