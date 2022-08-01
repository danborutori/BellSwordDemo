namespace demo {

    export class ARButton {
        readonly htmlElement = document.createElement( "input" )
        private overlayRoot: HTMLElement

        private currentSession?: XRSession

        constructor(
            readonly renderer: THREE.WebGLRenderer,
            private onSessionStart: ()=>void,
            private onSessionEnd: ()=>void
        ){
            this.htmlElement.type = "button"
            if( navigator.xr )
                this.htmlElement.value = "start AR"
            else
                this.htmlElement.value = "AR not supported"

            this.htmlElement.addEventListener( "click", ()=>{
                this.startAr()
            })

            const overlayRoot = document.createElement("div")
            overlayRoot.style.display = "none"
            const button = document.createElement("input")
            button.type = "button"
            button.value = "end AR"
            button.addEventListener("click", ()=>{
                this.endAr( false )
            })
            overlayRoot.appendChild(button)
            document.body.appendChild(overlayRoot)
            this.overlayRoot = overlayRoot
        
        }

        private isRequesting = false
        private async startAr(){

            if( navigator.xr ){
                if( !this.isRequesting ){
                    this.isRequesting = true
                    try{
                        const sessionInit = {
                            requiredFeatures: ["dom-overlay"],
                            domOverlay: {
                                root: this.overlayRoot
                            }
                        }
                        this.overlayRoot.style.display = ""
                        this.currentSession = await navigator.xr.requestSession("immersive-ar", sessionInit)
                        this.currentSession.onend = ()=>{
                            this.endAr( true )
                        }

                        this.renderer.xr.setReferenceSpaceType("local")
                        await this.renderer.xr.setSession(this.currentSession)

                        this.onSessionStart()
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
                this.overlayRoot.style.display = "none"
            }
        }
    }

}