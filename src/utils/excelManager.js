import * as XLSX from 'xlsx';

/**
 * 导出零件和装配体数据到 Excel
 * @param {Array} partsItems 零件列表
 * @param {Array} assemblyItems 装配体列表
 */
export function exportToExcel(partsItems, assemblyItems) {
  // 1. 准备零件数据
  const partsData = partsItems.map(item => ({
    'ID': item.id,
    '名称': item.name,
    '类型': item.type,
    '内径(mm)': item.params?.innerDiameter || '',
    '外径(mm)': item.params?.outerDiameter || '',
    '长度(mm)': item.params?.length || '',
    '弯曲半径(mm)': item.params?.bendRadius || '',
    '弯曲角度(°)': item.params?.bendAngle || '',
    '细分数': item.params?.segments || '',
    '截面(JSON)': item.params?.sections ? JSON.stringify(item.params.sections) : '',
    '路径数据(JSON)': item.params?.pathData ? JSON.stringify(item.params.pathData) : '',
    '创建时间': item.createTime
  }));

  // 2. 准备装配体数据
  const assemblyData = assemblyItems.map(item => ({
    '实例ID': item.id,
    '原零件ID': item.originalPartId || '',
    '名称': item.name,
    '类型': item.type,
    '位置X': item.position?.x ?? 0,
    '位置Y': item.position?.y ?? 0,
    '位置Z': item.position?.z ?? 0,
    '旋转X(rad)': item.rotation?.x ?? 0,
    '旋转Y(rad)': item.rotation?.y ?? 0,
    '旋转Z(rad)': item.rotation?.z ?? 0,
    '父组ID': item.parentGroupId || '',
    '是否展开': item.expanded !== undefined ? (item.expanded ? '是' : '否') : '',
    '参数(JSON)': item.params ? JSON.stringify(item.params) : '',
    '装配时间': item.assemblyTime
  }));

  // 3. 创建工作簿
  const wb = XLSX.utils.book_new();
  
  // 4. 添加零件工作表
  const wsParts = XLSX.utils.json_to_sheet(partsData);
  XLSX.utils.book_append_sheet(wb, wsParts, "零件列表");

  // 5. 添加装配体工作表
  const wsAssembly = XLSX.utils.json_to_sheet(assemblyData);
  XLSX.utils.book_append_sheet(wb, wsAssembly, "装配体列表");

  // 6. 导出文件
  const fileName = `3DBuild_Data_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * 从 Excel 文件导入零件和装配体数据
 * @param {File} file Excel 文件对象
 * @returns {Promise<{partsItems: Array, assemblyItems: Array}>}
 */
export function importFromExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const result = {
          partsItems: [],
          assemblyItems: []
        };

        // 1. 解析零件列表
        if (workbook.SheetNames.includes("零件列表")) {
          const wsParts = workbook.Sheets["零件列表"];
          const partsRaw = XLSX.utils.sheet_to_json(wsParts);
          
          result.partsItems = partsRaw.map(row => {
            const params = {
              innerDiameter: Number(row['内径(mm)']),
              outerDiameter: Number(row['外径(mm)']),
              segments: Number(row['细分数'])
            };
            
            if (row['长度(mm)'] !== '') params.length = Number(row['长度(mm)']);
            if (row['弯曲半径(mm)'] !== '') params.bendRadius = Number(row['弯曲半径(mm)']);
            if (row['弯曲角度(°)'] !== '') params.bendAngle = Number(row['弯曲角度(°)']);
            
            if (row['截面(JSON)']) {
              try { params.sections = JSON.parse(row['截面(JSON)']); } catch(e) { console.error('解析截面数据失败', e); }
            }
            if (row['路径数据(JSON)']) {
              try { params.pathData = JSON.parse(row['路径数据(JSON)']); } catch(e) { console.error('解析路径数据失败', e); }
            }

            return {
              id: String(row['ID']),
              name: String(row['名称']),
              type: String(row['类型']),
              params: params,
              createTime: String(row['创建时间'])
            };
          });
        }

        // 2. 解析装配体列表
        if (workbook.SheetNames.includes("装配体列表")) {
          const wsAssembly = workbook.Sheets["装配体列表"];
          const assemblyRaw = XLSX.utils.sheet_to_json(wsAssembly);
          
          result.assemblyItems = assemblyRaw.map(row => {
            let params = {};
            if (row['参数(JSON)']) {
              try { params = JSON.parse(row['参数(JSON)']); } catch(e) { console.error('解析装配体参数失败', e); }
            }

            return {
              id: String(row['实例ID']),
              originalPartId: row['原零件ID'] ? String(row['原零件ID']) : null,
              name: String(row['名称']),
              type: String(row['类型']),
              position: {
                x: Number(row['位置X']),
                y: Number(row['位置Y']),
                z: Number(row['位置Z'])
              },
              rotation: {
                x: Number(row['旋转X(rad)']),
                y: Number(row['旋转Y(rad)']),
                z: Number(row['旋转Z(rad)'])
              },
              parentGroupId: row['父组ID'] ? String(row['父组ID']) : null,
              expanded: row['是否展开'] === '是',
              params: params,
              assemblyTime: String(row['装配时间'])
            };
          });
        }

        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

