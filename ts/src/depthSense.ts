namespace demo {

    const m = new THREE.Matrix4
    const v = new THREE.Vector3
    const c = new THREE.Color
    const hsl = {
        h: 0,
        s: 0,
        l: 0
    }

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

    class DepthPlaneMaterial extends THREE.ShadowMaterial {

        readonly tDepth: THREE.IUniform = { value: null }
        readonly rawValueToMeters = { value: 1 }
        readonly cameraNear = { value: 1 }
        
        constructor(){
            super({
                side: THREE.FrontSide,
                transparent: false,
                depthTest: true,
                depthWrite: true
            })

            const defines = this.defines || (this.defines = {})
            defines.DEPTH_PLANE_MATERIAL = "1"

            this.onBeforeCompile = shader=>{

                shader.uniforms.tDepth = this.tDepth
                shader.uniforms.cameraNear = this.cameraNear
                shader.uniforms.rawValueToMeters = this.rawValueToMeters

                shader.vertexShader = `
                    uniform sampler2D tDepth;
                    uniform float cameraNear;
                    uniform float rawValueToMeters;

                    varying float vDepth;
                `+shader.vertexShader.replace(
                    "#include <project_vertex>",
                    `
                    #include <project_vertex>

                    float viewDepth = cameraNear+texture2D( tDepth, 1.0-uv.yx ).r*rawValueToMeters;
                    vDepth = viewDepth;
                    
                    mvPosition.xyz *= abs(viewDepth/mvPosition.z);
                    transformed = (inverse(modelViewMatrix)*mvPosition).xyz;

                    gl_Position = projectionMatrix * mvPosition;
                    `
                )
            }
        }
    }

    function shGetIrradianceAt( normal: THREE.Vector3, shCoefficients: THREE.Vector3[], target: THREE.Color ) {

        // normal is assumed to have unit length
    
        const x = normal.x, y = normal.y, z = normal.z
    
        // band 0
        v.copy(shCoefficients[ 0 ]).multiplyScalar( 0.886227 )
    
        // band 1
        v.addScaledVector( shCoefficients[ 1 ], 2.0 * 0.511664 * y )
        v.addScaledVector( shCoefficients[ 2 ], 2.0 * 0.511664 * z )
        v.addScaledVector( shCoefficients[ 3 ], 2.0 * 0.511664 * x )
    
        // band 2
        v.addScaledVector( shCoefficients[ 4 ], 2.0 * 0.429043 * x * y )
        v.addScaledVector( shCoefficients[ 5 ], 2.0 * 0.429043 * y * z )
        v.addScaledVector( shCoefficients[ 6 ], ( 0.743125 * z * z - 0.247708 ))
        v.addScaledVector( shCoefficients[ 7 ], 2.0 * 0.429043 * x * z )
        v.addScaledVector( shCoefficients[ 8 ], 0.429043 * ( x * x - y * y ) )
    
        return target.setRGB(v.x, v.y, v.z)
    
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
                new DepthPlaneMaterial()
            )
            m.receiveShadow = true
            m.renderOrder = -1
            return m
        })()

        senseDepth( renderer: THREE.WebGLRenderer, frame: XRFrame, camera: THREE.PerspectiveCamera, lightProbe: THREE.LightProbe ){            
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
                            this.mesh.material.tDepth.value = this.depthTexture
                            this.mesh.material.needsUpdate = true
                        }
                        this.depthTexture.image.data.set( new Uint16Array(depthInfo.data) )
                        this.depthTexture.needsUpdate = true
                        this.mesh.material.cameraNear.value = camera.near
                        this.mesh.material.rawValueToMeters.value = depthInfo.rawValueToMeters
                        shGetIrradianceAt( v.set(0,1,0), lightProbe.sh.coefficients, c)
                        this.mesh.material.opacity = 1-c.getHSL(hsl).l
                    }
                }
            }
        }
    }

}