import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchCases, createCase } from '../store/slices/caseSlice';
import { logout } from '../store/slices/authSlice';
import { RootState, AppDispatch } from '../store';
import { CaseItem } from '../types';
import { documentAPI } from '../api';

const Workbench = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newCase, setNewCase] = useState({ caseName: '', caseType: '招标投诉', summary: '' });
  const [filters, setFilters] = useState({
    caseName: '',
    keywords: '',
    caseType: '',
    startDate: '',
    endDate: '',
  });
  const [selectedCase, setSelectedCase] = useState<CaseItem | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);

  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { cases, isLoading } = useSelector((state: RootState) => state.case);
  const { user } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    dispatch(fetchCases());
  }, [dispatch]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSearch = () => {
    dispatch(fetchCases(filters));
  };

  const handleReset = () => {
    setFilters({ caseName: '', keywords: '', caseType: '', startDate: '', endDate: '' });
    dispatch(fetchCases());
  };

  const handleCreateCase = async () => {
    await dispatch(createCase(newCase));
    setShowCreateModal(false);
    setNewCase({ caseName: '', caseType: '招标投诉', summary: '' });
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadFiles(prev => [...prev, ...files]);
  };

  const handleRemoveFile = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!selectedCase || uploadFiles.length === 0) return;

    for (const file of uploadFiles) {
      await documentAPI.uploadDocument(selectedCase._id, file);
    }

    const response = await documentAPI.getDocuments(selectedCase._id);
    const documents = response.data;
    for (const doc of documents) {
      await documentAPI.extractText(doc._id);
    }

    await documentAPI.analyzeDocument(selectedCase._id);
    dispatch(fetchCases());
    setShowUploadModal(false);
    setUploadFiles([]);
    alert('文档上传并分析完成');
  };

  const handleNewCase = async () => {
    await dispatch(createCase({ caseName: newCase.caseName, caseType: newCase.caseType, summary: newCase.summary }));
    await dispatch(fetchCases());
    setShowCreateModal(false);
    setShowUploadModal(true);
    setNewCase({ caseName: '', caseType: '招标投诉', summary: '' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const ProgressRing = ({ progress }: { progress: number }) => {
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;

    return (
      <svg className="w-12 h-12" viewBox="0 0 50 50">
        <circle
          cx="25"
          cy="25"
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="4"
        />
        <circle
          cx="25"
          cy="25"
          r={radius}
          fill="none"
          stroke={progress === 100 ? '#10b981' : '#3b82f6'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
        <text
          x="25"
          y="25"
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-xs font-semibold fill-gray-700"
        >
          {progress}%
        </text>
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <div className="sidebar w-56 min-h-screen flex flex-col text-white">
          <div className="p-6 text-center border-b border-blue-700">
            <div className="text-4xl mb-2">⚖️</div>
            <h1 className="text-lg font-bold">粤省法智能辅助办案系统</h1>
          </div>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 mx-4 px-4 py-3 bg-blue-500 hover:bg-blue-400 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建案件
          </button>

          <button
            onClick={handleLogout}
            className="mt-auto mx-4 mb-4 px-4 py-3 bg-gray-600 hover:bg-gray-500 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            退出登录
          </button>
        </div>

        <div className="flex-1 p-6">
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">案件筛选</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">案件名称</label>
                <input
                  type="text"
                  name="caseName"
                  value={filters.caseName}
                  onChange={handleFilterChange}
                  placeholder="输入案件名称"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">案件关键词</label>
                <input
                  type="text"
                  name="keywords"
                  value={filters.keywords}
                  onChange={handleFilterChange}
                  placeholder="输入案件关键词"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">案件类型</label>
                <select
                  name="caseType"
                  value={filters.caseType}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">选择案件类型</option>
                  <option value="招标投诉">招标投诉</option>
                  <option value="招标审查">招标审查</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">起始日期</label>
                <input
                  type="date"
                  name="startDate"
                  value={filters.startDate}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div className="flex items-end gap-2">
                <input
                  type="date"
                  name="endDate"
                  value={filters.endDate}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSearch}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                查询
              </button>
              <button
                onClick={handleReset}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                重置
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">我的案件信息</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">案件运行状态</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">案件类型</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">案件名称</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">案件摘要</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">创建时间</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">操作选项</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        加载中...
                      </td>
                    </tr>
                  ) : cases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        暂无案件，点击左侧"新建案件"创建
                      </td>
                    </tr>
                  ) : (
                    cases.map((caseItem) => (
                      <tr key={caseItem._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <ProgressRing progress={caseItem.progress} />
                            <span className={`text-sm font-medium ${
                              caseItem.status === '已完成' ? 'text-green-600' :
                              caseItem.status === '处理中' ? 'text-blue-600' : 'text-gray-600'
                            }`}>
                              {caseItem.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-sm font-medium">
                            {caseItem.caseType}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium text-gray-800">{caseItem.caseName}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-600 max-w-xs truncate">{caseItem.summary || '-'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">{formatDate(caseItem.createdAt)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {caseItem.progress === 100 && (
                              <button
                                onClick={() => navigate(`/case/${caseItem._id}`)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                              >
                                办理
                              </button>
                            )}
                            {caseItem.progress < 100 && (
                              <button
                                onClick={() => {
                                  setSelectedCase(caseItem);
                                  setShowUploadModal(true);
                                }}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                              >
                                上传文档
                              </button>
                            )}
                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">共 10 条</span>
              <div className="flex items-center gap-2">
                <select className="px-3 py-1 border border-gray-300 rounded-lg text-sm">
                  <option>10条/页</option>
                  <option>20条/页</option>
                  <option>50条/页</option>
                </select>
                <button className="px-3 py-1 text-gray-400 hover:text-gray-600 disabled:opacity-50">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm">1</button>
                <button className="px-3 py-1 text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <span className="text-sm text-gray-500 ml-2">1 / 1 页</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800">新建案件</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">案件名称</label>
                <input
                  type="text"
                  value={newCase.caseName}
                  onChange={(e) => setNewCase(prev => ({ ...prev, caseName: e.target.value }))}
                  placeholder="请输入案件名称"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">案件类型</label>
                <select
                  value={newCase.caseType}
                  onChange={(e) => setNewCase(prev => ({ ...prev, caseType: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="招标投诉">招标投诉</option>
                  <option value="招标审查">招标审查</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">案件摘要</label>
                <textarea
                  value={newCase.summary}
                  onChange={(e) => setNewCase(prev => ({ ...prev, summary: e.target.value }))}
                  placeholder="请输入案件摘要"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={handleNewCase}
                disabled={!newCase.caseName}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                创建并上传文档
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && selectedCase && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800">上传案件附件</h2>
              <p className="text-sm text-gray-500 mt-1">案件：{selectedCase.caseName}</p>
            </div>
            <div className="p-6">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="text-4xl mb-4">📁</div>
                  <p className="text-gray-600 font-medium">点击或拖拽文件到此处上传</p>
                  <p className="text-sm text-gray-400 mt-1">支持 PDF、DOC、DOCX、JPG、PNG 格式</p>
                </label>
              </div>
              
              {uploadFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-medium text-gray-700">已选择文件：</h3>
                  {uploadFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="text-xl">📄</div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{file.name}</p>
                          <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFile(index)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={handleUpload}
                disabled={uploadFiles.length === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上传并分析
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Workbench;