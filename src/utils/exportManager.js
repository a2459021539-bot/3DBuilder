import * as THREE from 'three';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { SimpleFBXExporter } from './SimpleFBXExporter.js';

// 导出工具类
export const ExportManager = {
    // 导出为 OBJ
    exportOBJ(scene, fileName = 'model.obj') {
        const exporter = new OBJExporter();
        const result = exporter.parse(scene);
        this.downloadFile(result, fileName, 'text/plain');
    },

    // 导出为 FBX (简单版)
    exportFBX(scene, fileName = 'model.fbx') {
        const exporter = new SimpleFBXExporter();
        const result = exporter.parse(scene);
        this.downloadFile(result, fileName, 'text/plain');
    },

    // 下载文件辅助函数
    downloadFile(data, fileName, mimeType) {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};


