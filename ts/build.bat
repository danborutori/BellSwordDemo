call tsc-plus -p tsconfig.json

copy ..\bower_components\three.js\build\three.min.js ..\html\script\lib\three.min.js
copy ..\bower_components\three.js\examples\js\loaders\GLTFLoader.js ..\html\script\lib\GLTFLoader.js
copy ..\bower_components\three.js\examples\js\utils\BufferGeometryUtils.js ..\html\script\lib\BufferGeometryUtils.js
copy ..\bower_components\three.js\examples\js\controls\OrbitControls.js ..\html\script\lib\OrbitControls.js
