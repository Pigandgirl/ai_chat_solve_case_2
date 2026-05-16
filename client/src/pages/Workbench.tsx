import { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchCases, createCase, deleteCase, updateCaseProgress } from '../store/slices/caseSlice';
import { logout } from '../store/slices/authSlice';
import { RootState, AppDispatch } from '../store';
import { CaseItem, WSProgressMessage } from '../types';
import { documentAPI } from '../api';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws/case';

const Workbench = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
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
  const [expandedMenuCaseId, setExpandedMenuCaseId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadErrors, setUploadErrors] = useState<Array<{ file: string; error: string }>>([]);

  const processingCases = useRef<Set<number>>(new Set());
  const wsConnections = useRef<Map<number, WebSocket>>(new Map());
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const connectWebSocket = useCallback((caseId: number) => {
    if (wsConnections.current.has(caseId)) return;

    const ws = new WebSocket(`${WS_URL}/${caseId}`);

    ws.onopen = () => {
      console.log(`[WS] Connected to case ${caseId}`);
    };

    ws.onmessage = (event) => {
      try {
        const data: WSProgressMessage = JSON.parse(event.data);
        if (data.case_id === caseId) {
          dispatch(updateCaseProgress({
            case_id: data.case_id,
            progress: data.progress,
            status: data.status,
            message: data.message,
            case_name: data.case_name,
            summary: data.summary,
            complainant: data.complainant,
            respondent: data.respondent,
            project_info: data.project_info,
            complaint_items: data.complaint_items,
          }));
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onerror = () => {
      console.log(`[WS] Error for case ${caseId}`);
    };

    ws.onclose = () => {
      wsConnections.current.delete(caseId);
    };

    wsConnections.current.set(caseId, ws);
  }, [dispatch]);

  useEffect(() => {
    cases.forEach((c) => {
      if (c.progress > 0 && c.progress < 100 && c.status !== '已完成') {
        connectWebSocket(c.id);
      }
    });

    return () => {
      wsConnections.current.forEach((ws) => ws.close());
      wsConnections.current.clear();
    };
  }, [cases, connectWebSocket]);

  useEffect(() => {
    const inProgressCases = cases.filter(c => c.progress > 0 && c.progress < 100 && c.status !== '已完成');
    if (inProgressCases.length === 0) return;

    pollTimerRef.current = setInterval(() => {
      dispatch(fetchCases());
    }, 5000);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [dispatch, cases]);

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
    dispatch(fetchCases({
      case_name: filters.caseName,
      keywords: filters.keywords,
      case_type: filters.caseType,
      start_date: filters.startDate,
      end_date: filters.endDate,
    }));
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
    const pdfFiles = files.filter(f => f.type === 'application/pdf');
    const nonPdfFiles = files.filter(f => f.type !== 'application/pdf');

    if (nonPdfFiles.length > 0) {
      alert(`以下文件不是 PDF 格式，已忽略：${nonPdfFiles.map(f => f.name).join(', ')}`);
    }

    if (uploadFiles.length + pdfFiles.length > 10) {
      alert('最多只能上传 10 个文件');
      return;
    }

    const oversized = pdfFiles.filter(f => f.size > 50 * 1024 * 1024);
    if (oversized.length > 0) {
      alert(`以下文件超过 50MB，已忽略：${oversized.map(f => f.name).join(', ')}`);
    }

    const validFiles = pdfFiles.filter(f => f.size <= 50 * 1024 * 1024);
    setUploadFiles(prev => [...prev, ...validFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!selectedCase || uploadFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadErrors([]);

    try {
      setUploadStage('正在上传文件...');
      setUploadProgress(10);

      const response = await documentAPI.uploadDocuments(selectedCase.id, uploadFiles);

      setUploadProgress(100);
      setUploadStage('上传完成，正在后台处理...');

      if (response.data.errors && response.data.errors.length > 0) {
        setUploadErrors(response.data.errors);
      }

      await dispatch(fetchCases());

      setTimeout(() => {
        setShowUploadModal(false);
        setUploadFiles([]);
        setIsUploading(false);
        setUploadProgress(0);
        setUploadStage('');
      }, 2000);

    } catch (error: any) {
      setUploadStage(`上传失败: ${error.response?.data?.detail || error.message}`);
      setIsUploading(false);
    }
  };

  const handleNewCase = async () => {
    const resultAction = await dispatch(createCase({
      case_name: newCaseName || '待分析案件',
      case_type: newCaseType,
      summary: '',
    }));

    if (createCase.fulfilled.match(resultAction)) {
      const newCase = resultAction.payload as CaseItem;
      await dispatch(fetchCases());
      setShowCreateModal(false);
      setShowUploadModal(true);
      setSelectedCase(newCase);
      setNewCaseName('');
      setNewCaseType('招标投诉');
    }
  };

  const handleDeleteCase = async (caseId: number) => {
    if (!window.confirm('确定要删除这个案件吗？此操作不可恢复。')) return;
    await dispatch(deleteCase(caseId));
    setExpandedMenuCaseId(null);
  };

  const handleRetryDocument = async (caseId: number, documentId: number) => {
    try {
      await documentAPI.retryDocumentOCR(caseId, documentId);
      dispatch(fetchCases());
      alert('已重新触发 OCR 处理');
    } catch (error: any) {
      alert(`重试失败: ${error.response?.data?.detail || error.message}`);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  const getStatusDisplay = (caseItem: CaseItem) => {
    if (caseItem.status === '已完成' || caseItem.progress === 100) {
      return { text: '已完成', color: 'text-green-600', bg: 'bg-green-50' };
    }
    if (caseItem.status === 'failed') {
      return { text: '处理失败', color: 'text-red-600', bg: 'bg-red-50' };
    }
    return { text: '处理中', color: 'text-blue-600', bg: 'bg-blue-50' };
  };

  const ProgressRing = ({ progress, size = 48 }: { progress: number; size?: number }) => {
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;
    const strokeColor = progress === 100 ? '#10b981' : progress > 0 ? '#3b82f6' : '#d1d5db';

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="4"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-xs font-semibold fill-gray-700"
        >
          {progress}%
        </text>
      </svg>
    );
  };

  const inProgressCases = cases.filter(c => c.progress > 0 && c.progress < 100 && c.status !== '已完成');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <div className="sidebar w-64 min-h-screen flex flex-col text-white bg-gradient-to-b from-blue-900 via-blue-800 to-indigo-900 shadow-2xl">
          <div className="p-6 text-center border-b border-blue-700/50">
            <div className="text-5xl mb-3">⚖️</div>
            <h1 className="text-lg font-bold tracking-wide">粤省法智能辅助办案系统</h1>
            <div className="mt-2 px-3 py-1 bg-blue-700/50 rounded-full text-xs text-blue-200">法律文书智能分析</div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-6 mx-4 px-5 py-3.5 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 hover:from-blue-600 hover:via-blue-700 hover:to-indigo-700 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建案件
          </button>

          <button
            onClick={handleLogout}
            className="mt-auto mx-4 mb-4 px-5 py-3.5 bg-gradient-to-r from-gray-600 via-gray-700 to-gray-800 hover:from-gray-500 hover:via-gray-600 hover:to-gray-700 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            退出登录
          </button>
        </div>

        <div className="flex-1 p-6">
          {inProgressCases.length > 0 && (
            <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center gap-4 shadow-sm">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
              <div>
                <span className="text-blue-700 font-semibold">
                  {inProgressCases.length} 个案件正在后台处理中，进度每 5 秒自动刷新
                </span>
                <div className="text-xs text-blue-500 mt-1">
                  {inProgressCases.map(c => c.case_name).join('、')}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow duration-300 p-6 mb-6 border border-gray-100">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-800">案件筛选</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  案件名称
                </label>
                <input
                  type="text"
                  name="caseName"
                  value={filters.caseName}
                  onChange={handleFilterChange}
                  placeholder="输入案件名称"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-300 focus:bg-blue-50 outline-none transition-all duration-200 hover:border-blue-300"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  案件关键词
                </label>
                <input
                  type="text"
                  name="keywords"
                  value={filters.keywords}
                  onChange={handleFilterChange}
                  placeholder="输入案件关键词"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-300 focus:bg-blue-50 outline-none transition-all duration-200 hover:border-blue-300"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  案件类型
                </label>
                <select
                  name="caseType"
                  value={filters.caseType}
                  onChange={handleFilterChange}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-300 focus:bg-blue-50 outline-none transition-all duration-200 hover:border-blue-300 bg-white"
                >
                  <option value="">全部</option>
                  <option value="招标投诉">招标投诉</option>
                  <option value="招标审查">招标审查</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="startDate" className="flex items-center gap-2 text-sm font-semibold text-gray-600 cursor-pointer">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  起始日期
                </label>
                <div className="relative cursor-pointer" onClick={() => (document.getElementById('startDate') as HTMLInputElement)?.showPicker()}>
                  <input
                    id="startDate"
                    type="date"
                    name="startDate"
                    value={filters.startDate}
                    onChange={handleFilterChange}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-300 focus:bg-blue-50 outline-none transition-all duration-200 hover:border-blue-300 cursor-pointer"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="endDate" className="flex items-center gap-2 text-sm font-semibold text-gray-600 cursor-pointer">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  结束日期
                </label>
                <div className="relative cursor-pointer" onClick={() => (document.getElementById('endDate') as HTMLInputElement)?.showPicker()}>
                  <input
                    id="endDate"
                    type="date"
                    name="endDate"
                    value={filters.endDate}
                    onChange={handleFilterChange}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-300 focus:bg-blue-50 outline-none transition-all duration-200 hover:border-blue-300 cursor-pointer"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSearch}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-semibold flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                查询
              </button>
              <button
                onClick={handleReset}
                className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all duration-200 font-semibold hover:text-gray-800 border border-gray-200 hover:border-gray-300"
              >
                重置
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-800">我的案件信息</h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-50 to-indigo-50">
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">案件状态</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">案件类型</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">案件名称</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">案件摘要</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">创建时间</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">操作</th>
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
                    cases.map((caseItem) => {
                      const statusDisplay = getStatusDisplay(caseItem);
                      return (
                        <tr key={caseItem.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <ProgressRing progress={caseItem.progress} />
                              <div>
                                <span className={`text-sm font-bold ${statusDisplay.color}`}>
                                  {statusDisplay.text}
                                </span>
                                {caseItem.progress < 100 && caseItem.status !== 'failed' && (
                                  <p className="text-xs text-blue-500 mt-0.5 animate-pulse">
                                    {caseItem.processing_message || 'WebSocket 实时推送'}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 rounded-lg text-sm font-semibold border border-blue-100">
                              {caseItem.case_type}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-gray-800 group-hover:text-blue-600 transition-colors max-w-xs truncate block">
                              {caseItem.case_name}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-gray-600 max-w-xs truncate group-hover:text-gray-800 transition-colors">
                              {caseItem.summary || '-'}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-600">{formatDate(caseItem.created_at)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {caseItem.progress === 100 && (
                                <button
                                  onClick={() => navigate(`/case/${caseItem.id}`)}
                                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 text-sm font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                >
                                  办理
                                </button>
                              )}
                              {(caseItem.progress === 0 || caseItem.status === 'failed') && (
                                <button
                                  onClick={() => {
                                    setSelectedCase(caseItem);
                                    setShowUploadModal(true);
                                  }}
                                  className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all duration-200 text-sm font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                >
                                  上传文档
                                </button>
                              )}
                              {caseItem.documents && caseItem.documents.length > 0 && (
                                <div className="relative">
                                  <button
                                    onClick={() => setExpandedMenuCaseId(expandedMenuCaseId === caseItem.id ? null : caseItem.id)}
                                    className={`p-2 rounded-xl transition-all duration-200 ${expandedMenuCaseId === caseItem.id ? 'text-gray-600 bg-gray-100 shadow-sm' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                                    data-menu-button
                                  >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                    </svg>
                                  </button>
                                  {expandedMenuCaseId === caseItem.id && (
                                    <div className="dropdown-menu absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-20">
                                      <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                        已上传文档 ({caseItem.documents.length})
                                      </div>
                                      {caseItem.documents.map((doc) => (
                                        <div key={doc.id} className="px-4 py-2 hover:bg-gray-50">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm text-gray-700 truncate flex-1">{doc.original_name}</span>
                                            {doc.ocr_done ? (
                                              <button
                                                onClick={() => {
                                                  navigate(`/case/${caseItem.id}/document/${doc.id}/ocr-verify`);
                                                  setExpandedMenuCaseId(null);
                                                }}
                                                className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
                                              >
                                                查看/修正
                                              </button>
                                            ) : doc.error_message ? (
                                              <button
                                                onClick={() => handleRetryDocument(caseItem.id, doc.id)}
                                                className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                                              >
                                                重试
                                              </button>
                                            ) : (
                                              <span className="text-xs text-blue-500">处理中</span>
                                            )}
                                          </div>
                                          <div className="text-xs text-gray-400 mt-0.5">
                                            {formatFileSize(doc.file_size)} | {doc.page_count}页
                                            {doc.ocr_done && doc.ocr_confidence > 0 && (
                                              <span className="ml-2">置信度: {(doc.ocr_confidence * 100).toFixed(1)}%</span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                      <div className="h-px bg-gray-100 my-2"></div>
                                      <button
                                        onClick={() => {
                                          setSelectedCase(caseItem);
                                          setShowUploadModal(true);
                                          setExpandedMenuCaseId(null);
                                        }}
                                        className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-blue-50 transition-colors flex items-center gap-3"
                                      >
                                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                        </svg>
                                        继续上传
                                      </button>
                                      <button
                                        onClick={() => handleDeleteCase(caseItem.id)}
                                        className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        删除案件
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">共 {cases.length} 条</span>
            </div>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6">
              <h2 className="text-xl font-bold text-white">新建案件</h2>
              <p className="text-blue-100 text-sm mt-1">创建案件后可上传 PDF 文档进行 OCR 识别</p>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">案件名称（可选）</label>
                <input
                  type="text"
                  value={newCaseName}
                  onChange={(e) => setNewCaseName(e.target.value)}
                  placeholder="留空则自动生成"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">案件类型 <span className="text-red-500">*</span></label>
                <select
                  value={newCaseType}
                  onChange={(e) => setNewCaseType(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                >
                  <option value="招标投诉">招标投诉</option>
                  <option value="招标审查">招标审查</option>
                </select>
              </div>
              <div className="bg-blue-50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-800">智能 OCR 识别</p>
                    <p className="text-xs text-blue-600 mt-1">
                      上传 PDF 文档后，系统自动识别文本内容，支持扫描件和电子文档。处理完成后案件名称和摘要由 AI 自动生成。
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewCaseName('');
                  setNewCaseType('招标投诉');
                }}
                className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-semibold"
              >
                取消
              </button>
              <button
                onClick={handleNewCase}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-colors font-semibold shadow-lg hover:shadow-xl"
              >
                下一步：上传文档
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && selectedCase && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6">
              <h2 className="text-xl font-bold text-white">上传案件文档</h2>
              <p className="text-green-100 text-sm mt-1">案件：{selectedCase.case_name}</p>
            </div>
            <div className="p-6">
              {!isUploading ? (
                <>
                  <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-green-500 hover:bg-green-50/30 transition-all duration-300 cursor-pointer"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-green-500', 'bg-green-50/30'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('border-green-500', 'bg-green-50/30'); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-green-500', 'bg-green-50/30');
                      const files = Array.from(e.dataTransfer.files);
                      const event = { target: { files } } as unknown as React.ChangeEvent<HTMLInputElement>;
                      handleFileChange(event);
                    }}
                  >
                    <input
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                      id="file-upload"
                      accept=".pdf"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <div className="text-5xl mb-4">�</div>
                      <p className="text-gray-700 font-semibold text-lg">点击或拖拽 PDF 文件到此处</p>
                      <p className="text-gray-400 mt-2">支持 PDF 格式，单文件 ≤50MB，最多 10 个文件</p>
                    </label>
                  </div>

                  {uploadFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-700">已选择 {uploadFiles.length}/10 个文件：</h3>
                        <button
                          onClick={() => setUploadFiles([])}
                          className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                        >
                          清空
                        </button>
                      </div>
                      {uploadFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-red-600 font-bold text-xs">PDF</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                              <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveFile(index)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {uploadErrors.length > 0 && (
                    <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200">
                      <p className="text-sm font-semibold text-red-700 mb-2">部分文件上传失败：</p>
                      {uploadErrors.map((err, i) => (
                        <div key={i} className="text-sm text-red-600">
                          • {err.file}: {err.error}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="py-8">
                  <div className="text-center mb-6">
                    <ProgressRing progress={uploadProgress} size={96} />
                    <p className="text-lg font-semibold text-gray-700 mt-4">{uploadStage}</p>
                    <p className="text-sm text-green-600 mt-2">
                      文件上传完成后自动触发后台 OCR 识别...
                    </p>
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
                    setUploadErrors([]);
                  }
                }}
                disabled={isUploading}
                className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? '上传中...' : '取消'}
              </button>
              {!isUploading && (
                <button
                  onClick={handleUpload}
                  disabled={uploadFiles.length === 0}
                  className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-colors font-semibold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上传并后台识别 ({uploadFiles.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Workbench;
