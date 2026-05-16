const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:3001';
const TEST_PDF_PATH = path.join(__dirname, '..', 'text_file', '投诉书.pdf');

const api = axios.create({
  baseURL: SERVER_URL,
  timeout: 600000
});

async function testWorkflow() {
  console.log('========================================');
  console.log('  粤省法智能办案系统 全流程测试');
  console.log('========================================\n');

  let token = '';

  try {
    console.log('[Step 0] 登录获取Token...');
    const loginRes = await api.post('/api/auth/login', {
      username: 'admin',
      password: 'password'
    });
    token = loginRes.data.token;
    console.log('  ✅ 登录成功, Token获取成功');
    
    api.defaults.headers.common['Authorization'] = 'Bearer ' + token;

    console.log('\n[Step 1] 创建测试案件...');
    const createRes = await api.post('/api/cases', {
      caseName: '测试案件',
      caseType: '招标投诉',
      summary: '自动化测试案件'
    });
    const caseData = createRes.data;
    const caseId = caseData.case._id;
    console.log('  ✅ 案件创建成功:', caseId);

    console.log('\n[Step 2] 上传PDF文档...');
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(TEST_PDF_PATH);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('caseId', caseId);
    formData.append('file', blob, '投诉书.pdf');

    const uploadRes = await api.post('/api/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    const docId = uploadRes.data.document._id;
    console.log('  ✅ 文档上传成功:', docId);

    console.log('\n[Step 3] 检查数据库存储...');
    const docsRes = await api.get('/api/documents/' + caseId);
    const uploadedDoc = docsRes.data.find(d => d._id === docId);
    if (uploadedDoc) {
      console.log('  ✅ 数据库已存储文档');
      console.log('     - 文件名:', uploadedDoc.fileName);
      console.log('     - 文件路径:', uploadedDoc.filePath);
      console.log('     - 文件大小:', (fileBuffer.length / 1024).toFixed(1) + ' KB');
    } else {
      console.log('  ❌ 数据库中未找到文档');
    }

    console.log('\n[Step 4] 调用OCR识别（SiliconFlow PaddleOCR-VL）...');
    console.log('  ⚠️ 注意: 6.1MB扫描PDF处理可能需要30秒以上...');
    const ocrRes = await api.post('/api/documents/' + docId + '/ocr');
    const ocrContent = ocrRes.data.content || '';
    console.log('  ✅ OCR识别完成');
    console.log('     - 识别字数:', ocrRes.data.length || 0);
    console.log('     - 内容预览:', ocrContent.substring(0, 300));
    console.log('');

    if (ocrContent.length < 50) {
      console.log('  ⚠️ OCR文字较少，可能是扫描件或文字无法提取');
    }

    console.log('\n[Step 5] 调用分析接口（向量化 + MiniMax提取）...');
    console.log('  ℹ️ 正在调用硅基流动bge-m3向量化...');
    console.log('  ℹ️ 正在调用MiniMax大模型提取案件信息...');
    const analyzeRes = await api.post('/api/documents/analyze/' + caseId);
    const result = analyzeRes.data.result || {};
    console.log('  ✅ 分析完成');
    console.log('     - 案件名称:', result.caseName || 'N/A');
    console.log('     - 案件摘要:', result.summary || 'N/A');
    console.log('     - 向量块数:', result.vectorChunks || 0);
    console.log('     - 使用模型:', result.llmModel || 'N/A');

    console.log('\n[Step 6] 验证向量数据库...');
    const vectorFile = path.join(__dirname, 'data', 'vectors.json');
    if (fs.existsSync(vectorFile)) {
      const vectors = JSON.parse(fs.readFileSync(vectorFile, 'utf-8'));
      const caseVectors = vectors[caseId] || [];
      console.log('  ✅ 向量数据库存在');
      console.log('     - 案件向量总数:', caseVectors.length);
      if (caseVectors.length > 0) {
        console.log('     - 向量维度示例:', caseVectors[0].embedding.length);
        console.log('     - 向量块1长度:', caseVectors[0].text.length, '字符');
        console.log('     - 向量块1内容:', caseVectors[0].text.substring(0, 100) + '...');
      }
    } else {
      console.log('  ⚠️ 向量数据库文件不存在');
    }

    console.log('\n[Step 7] 验证案件最终状态...');
    const caseRes = await api.get('/api/cases/' + caseId);
    const finalCase = caseRes.data;
    console.log('  ✅ 案件状态:');
    console.log('     - 案件名称:', finalCase.caseName);
    console.log('     - 案件摘要:', (finalCase.summary || '').substring(0, 150));
    console.log('     - 进度:', finalCase.progress + '%');
    console.log('     - 状态:', finalCase.status);

    console.log('\n========================================');
    console.log('  测试流程完成！');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('  HTTP状态:', error.response.status);
      console.error('  错误数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.code === 'ECONNREFUSED') {
      console.error('  ⚠️ 无法连接到后端服务器 (http://localhost:3001)');
      console.error('  ℹ️ 请确保后端服务正在运行: cd server && npm run dev');
    }
  }
}

testWorkflow();
