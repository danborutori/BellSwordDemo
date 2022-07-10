namespace demo {

    const v1 = new THREE.Vector3
    const v2 = new THREE.Vector3
    const m1 = new THREE.Matrix4

    const unitY = new THREE.Vector3(0,1,0)
    const gravity = -9.8

    const reboundForce = 5000
    const edgeReboundForce = 25000
    const dampingFactor = 20
    const spacing = 0.01

    function clamp( n: number, min: number, max: number ){
        return Math.max(min, Math.min(max, n))
    }

    let cachedGeometry: THREE.BufferGeometry
    function createGeometry(
        swordGeometry: THREE.BufferGeometry,
        coinGeometries: THREE.BufferGeometry[]
    ){
        if( !cachedGeometry ){
            function setSkinWeight( g: THREE.BufferGeometry, id: number,  ){
                const count = g.attributes.position.count
                const skinIndex = new THREE.BufferAttribute( new Float32Array(count*4), 4 )
                const skinWeight = new THREE.BufferAttribute( new Float32Array(count*4), 4 )
                for( let i=0; i<count; i++ ){
                    skinIndex.setXYZW( i, id, 0, 0, 0 )
                    skinWeight.setXYZW( i, 1, 0, 0, 0 )
                }
                g.setAttribute("skinIndex", skinIndex)
                g.setAttribute("skinWeight", skinWeight)
            }
        
            const g: THREE.BufferGeometry[] = new Array(21)
            g[0] = swordGeometry.clone()
            setSkinWeight( g[0], 0 )
            
            for( let i=0; i<4; i++ ){
                for( let j=0; j<coinGeometries.length; j++ ){
                    const idx = i*coinGeometries.length+j+1
                    const _g = coinGeometries[j].clone()
                    setSkinWeight(_g, idx )
                    g[idx] = _g
                }
            }

            cachedGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries(g)
        }

        return cachedGeometry
    }

    export class BellSword {

        static async create(): Promise<BellSword>{
            const gltf = await loadGltf("asset/bell_sword/bell_sword.gltf")

            const scene = gltf.scene as THREE.Scene

            const swordMesh = scene.getObjectByName("bell_sword") as THREE.Mesh

            const bigPathNodesL: THREE.Vector3[] = new Array(8)
            const smallPathNodesL: THREE.Vector3[] = new Array(4)
            for( let i=0; i<bigPathNodesL.length; i++ ){
                const o = scene.getObjectByName(`path${i}`)!
                swordMesh.remove( o )
                bigPathNodesL[i] = o.position.clone()
            }
            for( let i=0; i<smallPathNodesL.length; i++ ){
                const o = scene.getObjectByName(`paths${i+1}`)!
                swordMesh.remove( o )
                smallPathNodesL[i] = o.position.clone()
            }
            const bigPathNodesR = bigPathNodesL.map( v=>new THREE.Vector3(-v.x,v.y,v.z))
            const smallPathNodesR = smallPathNodesL.map( v=>new THREE.Vector3(-v.x,v.y,v.z))

            const coins: THREE.Mesh[] = new Array(5)
            for( let i=0; i<coins.length; i++ ){
                coins[i] = scene.getObjectByName(`coin_${i+1}`) as THREE.Mesh
            }

            const bones: THREE.Bone[] = new Array(21)
            for( let i=0; i<bones.length; i++ ){
                bones[i] = new THREE.Bone()
                if( i>0 ){
                    bones[0].add( bones[i])
                }
            }
            const skeleton = new THREE.Skeleton(bones)

            const mesh = new THREE.SkinnedMesh(
                createGeometry(
                    swordMesh.geometry,
                    coins.map(c=>c.geometry)
                ),
                swordMesh.material
            )
            mesh.castShadow = true
            mesh.receiveShadow = true
            mesh.frustumCulled = true
            mesh.bind( skeleton )

            return new BellSword(
                mesh,
                skeleton.bones[0],
                [
                    {
                        nodes: bigPathNodesL,
                        bones: skeleton.bones.slice(1,6)
                    },
                    {
                        nodes: bigPathNodesR,
                        bones: skeleton.bones.slice(6,11)
                    },
                    {
                        nodes: smallPathNodesL,
                        bones: skeleton.bones.slice(11,16)
                    },
                    {
                        nodes: smallPathNodesR,
                        bones: skeleton.bones.slice(16,21)
                    }
                ]
            )
        }

        private paths: {
            nodes: {
                position: THREE.Vector3
                direction: THREE.Vector3
            }[]
            length: number
            coins: {
                fraction: number
                velocity: number
                bone: THREE.Bone
            }[]
        }[]

        private constructor(
            readonly object3D: THREE.Object3D,
            private boneRoot: THREE.Bone,
            paths: {
                nodes: THREE.Vector3[]
                bones: THREE.Bone[]
            }[]
        ){
            this.paths = paths.map( p=>{
                const nodes = p.nodes.map((position, i)=>{
                    const idx0 = Math.min(i,p.nodes.length-2)
                    const idx1 = idx0+1
                    return {
                        position: position,
                        direction: new THREE.Vector3().subVectors( p.nodes[idx1], p.nodes[idx0]).normalize()
                    }
                })
                return {
                    nodes: nodes,
                    length: nodes.reduce( (a,b,i)=>{
                        if( i+1<nodes.length )
                            return a+v1.subVectors(nodes[i].position, nodes[i+1].position).length()
                        else
                            return a
                    }, 0),
                    coins: p.bones.map((m, i)=>{
                        return {
                            fraction: (i+0.5)/p.bones.length,
                            velocity: 0,
                            bone: m
                        }
                    })
                }
            })
        }

        private simulate( deltaTime: number ){
            m1.copy(this.object3D.matrixWorld).invert()
            const localGravity = v1.set(0,1,0).transformDirection(m1).multiplyScalar(gravity)

            const substep = 5

            const subDeltaTime = Math.min(1/30,deltaTime)/substep
            
            for( let j=0; j<substep; j++ ){
                for( let p of this.paths ){
                    for( let i=0; i<p.coins.length; i++ ){

                        const c = p.coins[i]

                        const idx = c.fraction*p.nodes.length
                        const idx0 = clamp(Math.floor(idx), 0, p.nodes.length-2)
                        const idx1 = idx0+1
                        const fract = idx-idx0
                        const direction = v2.lerpVectors(
                            p.nodes[idx0].direction,
                            p.nodes[idx1].direction,
                            fract
                        ).normalize()
                        let linearForce = direction.dot(localGravity)
                        linearForce /= p.length // normalize to path length
                        let neighbourForce = 0
                        const relSpac = spacing/p.length
                        if( i-1>=0 ){
                            neighbourForce += Math.max(p.coins[i-1].fraction-c.fraction+relSpac,0)*reboundForce
                        }
                        if( i+1<p.coins.length ){
                            neighbourForce += Math.min(p.coins[i+1].fraction-c.fraction-relSpac,0)*reboundForce
                        }
                        linearForce += neighbourForce
                        linearForce += edgeReboundForce*Math.max(0,-c.fraction)
                        linearForce += edgeReboundForce*Math.min(0,1-c.fraction)
                        linearForce += -c.velocity*dampingFactor // damping force
                        
                        c.velocity += linearForce*subDeltaTime

                        c.fraction += c.velocity*subDeltaTime
                    }
                }
            }
        }

        update( deltaTime: number ){
            this.simulate(deltaTime)

            for( let p of this.paths ){
                for( let i=0; i<p.coins.length; i++ ){
                    const c = p.coins[i]

                    const idx = c.fraction*p.nodes.length
                    const idx0 = clamp(Math.floor(idx), 0, p.nodes.length-2)
                    const idx1 = idx0+1
                    const fract = idx-idx0
                    const n0 = p.nodes[idx0]
                    const n1 = p.nodes[idx1]
                    c.bone.position.lerpVectors(
                        n0.position,
                        n1.position,
                        fract
                    ),
                    c.bone.quaternion.setFromUnitVectors( unitY, v1.lerpVectors(
                        n0.direction,
                        n1.direction,
                        fract
                    ))
                }
            }
            this.boneRoot.position.set(0,0,0)
            this.boneRoot.quaternion.identity()
            this.boneRoot.applyMatrix4( this.object3D.matrixWorld )
            this.boneRoot.updateMatrixWorld()
        }

    }    

}