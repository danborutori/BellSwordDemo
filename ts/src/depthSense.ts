namespace demo {

    const m = new THREE.Matrix4
    const v = new THREE.Vector3

    interface XRDepthInformation {
        readonly width: number
        readonly height: number
    
        readonly normDepthBufferFromNormView: XRRigidTransform
        readonly rawValueToMeters: number
    }

    interface XRCPUDepthInformation extends XRDepthInformation {
        readonly data: ArrayBuffer
      
        getDepthInMeters(x: number, y: number): number
    } 

    class DepthPlaneMaterial extends THREE.MeshBasicMaterial {

        readonly rawValueToMeters = { value: 1 }
        readonly cameraNear = { value: 1 }
        
        constructor( texture: THREE.DataTexture ){
            super({
                map: texture,
                side: THREE.FrontSide,
                transparent: false,
                colorWrite: false,
                depthTest: true,
                depthWrite: true
            })

            const defines = this.defines || (this.defines = {})
            defines.DEPTH_PLANE_MATERIAL = "1"

            this.onBeforeCompile = shader=>{

                shader.uniforms.cameraNear = this.cameraNear
                shader.uniforms.rawValueToMeters = this.rawValueToMeters

                shader.vertexShader = `
                    uniform sampler2D map;
                    uniform float cameraNear;
                    uniform float rawValueToMeters;

                    #include <packing>
                `+shader.vertexShader.replace(
                    "#include <uv_vertex>",
                    `
                    #include <uv_vertex>
                    vUv = 1.0-vUv.yx;
                    `
                ).replace(
                    "#include <project_vertex>",
                    `
                    #include <project_vertex>

                    float viewDepth = cameraNear+texture2D( map, vUv ).r*rawValueToMeters;
                    
                    mvPosition.xyz *= abs(viewDepth/mvPosition.z);

                    gl_Position = projectionMatrix * mvPosition;
                    `
                )

                shader.fragmentShader = `
                    uniform float rawValueToMeters;
                `+shader.fragmentShader.replace(
                    "#include <map_fragment>",
                    `
                    #include <map_fragment>
                    diffuseColor.r *= rawValueToMeters/1.0;
                    `
                )
            }
        }
    }

    export class DepthSense {

        private depthTexture = new THREE.DataTexture(
            new Float32Array([0]),
            1, 1,
            THREE.RedFormat,
            THREE.FloatType,
            THREE.UVMapping,
            THREE.ClampToEdgeWrapping,
            THREE.ClampToEdgeWrapping,
            THREE.LinearFilter,
            THREE.LinearFilter,
            4
        )
        readonly mesh = (()=>{
            const m = new THREE.Mesh(
                new THREE.PlaneBufferGeometry(1, 1, 200, 200),
                new DepthPlaneMaterial( this.depthTexture )
            )
            m.renderOrder = -1
            return m
        })()

        senseDepth( renderer: THREE.WebGLRenderer, frame: XRFrame, camera: THREE.PerspectiveCamera ){            
            const refSpace = renderer.xr.getReferenceSpace()
            if( 
                refSpace &&
                frame.getDepthInformation
            ){
                const pose = frame.getViewerPose( refSpace )
                if( pose && pose.views.length>0 ){                    
                    const view = pose.views[0]
                    const depthInfo: XRCPUDepthInformation | null = frame.getDepthInformation( view )

                    m.fromArray( view.projectionMatrix )
                    v.set(1,1,this.mesh.position.z).applyMatrix4(m)
                    this.mesh.scale.set( 2/v.x, 2/v.y, 1 )

                    if( depthInfo ){
                        if( this.depthTexture.image.width!=depthInfo.width ||
                            this.depthTexture.image.height!=depthInfo.height
                        ){
                            this.depthTexture.dispose()
                            this.depthTexture = new THREE.DataTexture(
                                new Float32Array(depthInfo.width*depthInfo.height),
                                depthInfo.width,
                                depthInfo.height,
                                THREE.RedFormat,
                                THREE.FloatType,
                                THREE.UVMapping,
                                THREE.ClampToEdgeWrapping,
                                THREE.ClampToEdgeWrapping,
                                THREE.LinearFilter,
                                THREE.LinearFilter,
                                4
                            )
                            this.depthTexture.generateMipmaps = false
                            this.mesh.material.map = this.depthTexture
                            this.mesh.material.needsUpdate = true
                        }
                        this.depthTexture.image.data.set( new Uint16Array(depthInfo.data) )
                        this.depthTexture.needsUpdate = true
                        this.mesh.material.cameraNear.value = camera.near
                        this.mesh.material.rawValueToMeters.value = depthInfo.rawValueToMeters
                    }
                }
            }
        }
    }

}