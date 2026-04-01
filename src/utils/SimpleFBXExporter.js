import * as THREE from 'three';

/**
 * A simple ASCII FBX Exporter for Three.js
 * Exports Meshes with Position and Normal data.
 * Limited support for hierarchy and materials.
 */
export class SimpleFBXExporter {
    constructor() {}

    parse(object) {
        let output = '';
        
        // Header
        output += '; FBX 7.1.0 project file\n';
        output += '; Created by SimpleFBXExporter\n\n';
        output += 'FBXHeaderExtension:  {\n';
        output += '\tFBXHeaderVersion: 1003\n';
        output += '\tFBXVersion: 7100\n';
        output += '}\n\n';

        // Global Settings
        output += 'GlobalSettings:  {\n';
        output += '\tVersion: 1000\n';
        output += '\tProperties70:  {\n';
        output += '\t\tP: "UpAxis", "int", "Integer", "",1\n'; // Y-up
        output += '\t}\n';
        output += '}\n\n';

        // Objects
        output += 'Objects:  {\n';

        const models = [];
        const geometries = [];
        let nextId = 1000;

        object.traverse((child) => {
            if (child.isMesh) {
                const modelId = nextId++;
                const geometryId = nextId++;
                
                models.push({
                    id: modelId,
                    name: child.name || `Model_${modelId}`,
                    geometryId: geometryId,
                    position: child.position,
                    rotation: child.rotation,
                    scale: child.scale,
                    matrixWorld: child.matrixWorld
                });

                geometries.push({
                    id: geometryId,
                    name: `Geometry_${geometryId}`,
                    mesh: child
                });
            }
        });

        // Write Geometries
        geometries.forEach(geo => {
            output += `\tGeometry: ${geo.id}, "Geometry::${geo.name}", "Mesh" {\n`;
            output += '\t\tVertices: *';
            
            const positionAttribute = geo.mesh.geometry.attributes.position;
            const indexAttribute = geo.mesh.geometry.index;
            const normalAttribute = geo.mesh.geometry.attributes.normal;
            
            // Vertices
            const vertices = [];
            // Apply world matrix to vertices to simplify structure (bake transforms)
            // Or we can keep local and use Model transforms. 
            // For simplicity in this basic exporter, let's bake everything into world space for a single "scene" export
            // or export local and set Model transforms. 
            // Let's use Local positions + Model transforms (standard way).
            
            // Actually, baking is safer for simple viewers if hierarchy is complex.
            // But let's try standard local export.
            
            for (let i = 0; i < positionAttribute.count; i++) {
                vertices.push(positionAttribute.getX(i), positionAttribute.getY(i), positionAttribute.getZ(i));
            }
            output += `${vertices.length} {\n\t\t\ta: ${vertices.join(',')}\n\t\t}\n`;

            // Indices (PolygonVertexIndex)
            output += '\t\tPolygonVertexIndex: *';
            const indices = [];
            if (indexAttribute) {
                for (let i = 0; i < indexAttribute.count; i += 3) {
                    indices.push(indexAttribute.getX(i));
                    indices.push(indexAttribute.getX(i+1));
                    indices.push(~indexAttribute.getX(i+2)); // Last index of polygon is XOR'd
                }
            } else {
                for (let i = 0; i < positionAttribute.count; i += 3) {
                    indices.push(i);
                    indices.push(i+1);
                    indices.push(~(i+2));
                }
            }
            output += `${indices.length} {\n\t\t\ta: ${indices.join(',')}\n\t\t}\n`;

            output += '\t\tGeometryVersion: 124\n';

            // Normals
            if (normalAttribute) {
                output += '\t\tLayerElementNormal: 0 {\n';
                output += '\t\t\tVersion: 101\n';
                output += '\t\t\tName: ""\n';
                output += '\t\t\tMappingInformationType: "ByVertice"\n';
                output += '\t\t\tReferenceInformationType: "Direct"\n';
                output += '\t\t\tNormals: *';
                const normals = [];
                for (let i = 0; i < normalAttribute.count; i++) {
                    normals.push(normalAttribute.getX(i), normalAttribute.getY(i), normalAttribute.getZ(i));
                }
                output += `${normals.length} {\n\t\t\t\ta: ${normals.join(',')}\n\t\t\t}\n`;
                output += '\t\t}\n';
            }

            output += '\t}\n';
        });

        // Write Models
        models.forEach(model => {
            output += `\tModel: ${model.id}, "Model::${model.name}", "Mesh" {\n`;
            output += '\t\tVersion: 232\n';
            output += '\t\tProperties70:  {\n';
            output += '\t\t\tP: "RotationActive", "bool", "", "",1\n';
            output += '\t\t\tP: "InheritType", "enum", "", "",1\n';
            output += '\t\t\tP: "ScalingMax", "Vector3D", "Vector", "",0,0,0\n';
            output += '\t\t\tP: "DefaultAttributeIndex", "int", "Integer", "",0\n';
            
            // Transforms
            output += `\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",${model.position.x},${model.position.y},${model.position.z}\n`;
            output += `\t\t\tP: "Lcl Rotation", "Lcl Rotation", "", "A",${THREE.MathUtils.radToDeg(model.rotation.x)},${THREE.MathUtils.radToDeg(model.rotation.y)},${THREE.MathUtils.radToDeg(model.rotation.z)}\n`;
            output += `\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",${model.scale.x},${model.scale.y},${model.scale.z}\n`;
            
            output += '\t\t}\n';
            output += '\t\tShading: T\n';
            output += '\t\tCulling: "CullingOff"\n';
            output += '\t}\n';
        });

        output += '}\n\n';

        // Connections
        output += 'Connections:  {\n';
        models.forEach(model => {
            // Model to Scene (0)
            output += `\tC: "OO",${model.id},0\n`;
            // Geometry to Model
            output += `\tC: "OO",${model.geometryId},${model.id}\n`;
        });
        output += '}\n';

        return output;
    }
}








