import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchCases, createCase, deleteCase } from '../store/slices/caseSlice';
import { logout } from '../store/slices/authSlice';
import { RootState, AppDispatch } from '../store';
import { CaseItem } from '../types';
import { documentAPI } from '../api';

const Workbench = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newCaseType, setNewCaseType] = useState('招标投诉');
  const [filters, setFilters] = useState({
    caseName: '',
    keywords: '',
    caseType: '',
    startDate: '',
    endDate: '',
  });
  const [selectedCase, setSelectedCase] = useState<CaseItem | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [expandedMenuCaseId, setExpandedMenuCaseId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [uploadedFileCount, setUploadedFileCount] = useState(0);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isMenuButton = target.closest('[data-menu-button]');
      const isMenu = target.closest('.dropdown-menu');
      if (!isMenuButton && !isMenu) {
        setExpandedMenuCaseId(null);
      }
    };

    if (expandedMenuCaseId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expandedMenuCaseId]);

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

    setIsUploading(true);
    setUploadProgress(0);
    const totalFiles = uploadFiles.length;

    try {
      setUploadStage('正在上传文档...');
      setUploadProgress(10);
      
      for (let i = 0; i < uploadFiles.length; i++) {
        await documentAPI.uploadDocument(selectedCase._id, uploadFiles[i]);
        setUploadProgress(Math.round((i + 1) / totalFiles * 30));
      }

      setUploadStage('正在识别文档内容...');
      setUploadProgress(40);

      const response = await documentAPI.getDocuments(selectedCase._id);
      const documents = response.data;
      
      for (let i = 0; i < documents.length; i++) {
        await documentAPI.extractText(documents[i]._id);
        setUploadProgress(40 + Math.round((i + 1) / documents.length * 30));
      }

      setUploadStage('正在分析案件信息...');
      setUploadProgress(80);

      await documentAPI.analyzeDocument(selectedCase._id);
      setUploadProgress(100);

      setUploadStage('分析完成！');
      setUploadedFileCount(totalFiles);
      await dispatch(fetchCases());
      
      setShowUploadModal(false);
      setUploadFiles([]);
      setShowSuccessModal(true);

    } catch (error) {
      setUploadStage('上传失败，请重试');
      setIsUploading(false);
    }
  };

  const handleNewCase = async () => {
    const resultAction = await dispatch(createCase({ caseName: '', caseType: newCaseType, summary: '' }));
    if (createCase.fulfilled.match(resultAction)) {
      const newCase = resultAction.payload.case;
      await dispatch(fetchCases());
      setShowCreateModal(false);
      setShowUploadModal(true);
      setSelectedCase(newCase);
    }
    setNewCaseType('招标投诉');
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
                            <div className="relative">
                              <button
                                onClick={() => setExpandedMenuCaseId(expandedMenuCaseId === caseItem._id ? null : caseItem._id)}
                                className={`p-2 rounded-xl transition-all duration-200 ${expandedMenuCaseId === caseItem._id ? 'text-gray-600 bg-gray-100 shadow-sm' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                                data-menu-button
                              >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                </svg>
                              </button>
                              {expandedMenuCaseId === caseItem._id && (
                                <div className="dropdown-menu absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-20">
                                  {caseItem.progress === 100 && (
                                    <button
                                      onClick={() => {
                                        setSelectedCase(caseItem);
                                        setShowUploadModal(true);
                                        setExpandedMenuCaseId(null);
                                      }}
                                      className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 flex items-center gap-3 group"
                                    >
                                      <div className="w-8 h-8 rounded-lg bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                                        </svg>
                                      </div>
                                      <div>
                                        <div className="font-medium">重新上传分析</div>
                                        <div className="text-xs text-gray-400">更新案件文档</div>
                                      </div>
                                    </button>
                                  )}
                                  <div className="h-px bg-gray-100 my-2"></div>
                                  <button
                                    onClick={() => {
                                      if (window.confirm('确定要删除这个案件吗？此操作不可恢复。')) {
                                        dispatch(deleteCase(caseItem._id));
                                      }
                                      setExpandedMenuCaseId(null);
                                    }}
                                    className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-gradient-to-r hover:from-red-50 hover:to-orange-50 transition-all duration-200 flex items-center gap-3 group"
                                  >
                                    <div className="w-8 h-8 rounded-lg bg-red-50 group-hover:bg-red-100 flex items-center justify-center transition-colors">
                                      <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                      </svg>
                                    </div>
                                    <div>
                                      <div className="font-medium">删除案件</div>
                                      <div className="text-xs text-red-300">不可恢复操作</div>
                                    </div>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">共 {cases.length} 条</span>
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
            <div className="p-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">案件类型</label>
                <select
                  value={newCaseType}
                  onChange={(e) => setNewCaseType(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="招标投诉">招标投诉</option>
                  <option value="招标审查">招标审查</option>
                </select>
                <p className="mt-3 text-sm text-gray-500">
                  💡 案件名称和案件摘要将在文档上传后由 AI 大模型自动分析填入
                </p>
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
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                下一步：上传文档
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
              {!isUploading ? (
                <>
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
                </>
              ) : (
                <div className="py-8">
                  <div className="text-center mb-6">
                    <div className="w-24 h-24 mx-auto mb-4 relative">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="48" cy="48" r="40" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                        <circle 
                          cx="48" cy="48" r="40" 
                          stroke="url(#gradient)" 
                          strokeWidth="8" 
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 40}
                          strokeDashoffset={2 * Math.PI * 40 * (1 - uploadProgress / 100)}
                          className="transition-all duration-300"
                        />
                        <defs>
                          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor="#8b5cf6" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-bold text-gray-800">{uploadProgress}%</span>
                      </div>
                    </div>
                    <p className="text-lg font-medium text-gray-700">{uploadStage}</p>
                    {uploadProgress < 100 && (
                      <p className="text-sm text-gray-500 mt-2">正在处理中，请稍候...</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  if (!isUploading) {
                    setShowUploadModal(false);
                    setUploadFiles([]);
                  }
                }}
                disabled={isUploading}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? '处理中...' : '取消'}
              </button>
              {!isUploading && (
                <button
                  onClick={handleUpload}
                  disabled={uploadFiles.length === 0}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上传并分析
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-green-400 to-emerald-500 p-8 text-center">
              <div className="w-20 h-20 mx-auto bg-white rounded-full flex items-center justify-center mb-4 shadow-lg">
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">上传并分析成功！</h3>
              <p className="text-green-100">
                已成功上传 {uploadedFileCount} 个文档并完成分析
              </p>
            </div>
            <div className="p-6">
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">文档识别</p>
                    <p className="text-xs text-gray-500">OCR 文本提取完成</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">AI 分析</p>
                    <p className="text-xs text-gray-500">案件信息提取完成</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">案件生成</p>
                    <p className="text-xs text-gray-500">案件要素已自动填入</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    setIsUploading(false);
                    setUploadProgress(0);
                  }}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                >
                  返回工作台
                </button>
                <button
                  onClick={() => {
                    const latestCase = cases[0];
                    if (latestCase) {
                      setShowSuccessModal(false);
                      setIsUploading(false);
                      setUploadProgress(0);
                      navigate(`/case/${latestCase._id}`);
                    }
                  }}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all font-medium shadow-lg hover:shadow-xl"
                >
                  立即查看详情
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Workbench;
