import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchCaseById, updateCaseProgress } from '../store/slices/caseSlice';
import { RootState, AppDispatch } from '../store';
import { documentAPI } from '../api';
import { WSProgressMessage } from '../types';
import { Document, Page, pdfjs } from 'react-pdf';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const getWsBaseUrl = () => {
  if (process.env.REACT_APP_WS_URL) return process.env.REACT_APP_WS_URL;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws/case`;
};

const CaseDetail = () => {
  const [activeTab, setActiveTab] = useState('case-elements');
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { currentCase, isLoading } = useSelector((state: RootState) => state.case);

  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfBlobRaw, setPdfBlobRaw] = useState<Blob | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [documentAnalysis, setDocumentAnalysis] = useState<{ loading: boolean; text?: string; error?: string; done?: boolean }>({ loading: false, done: false });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('1_财政厅移交材料');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['1_财政厅移交材料']));
  const [isDirCollapsed, setIsDirCollapsed] = useState(false);
  const pdfBlobUrlRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isSwitchingDocRef = useRef(false);
  const loadFromBottomRef = useRef(false);

  useEffect(() => {
    if (id) {
      dispatch(fetchCaseById(parseInt(id)));
    }
  }, [dispatch, id]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!id || !currentCase || currentCase.progress >= 100 || currentCase.status === '已完成') return;

    const caseId = parseInt(id);
    const ws = new WebSocket(`${getWsBaseUrl()}/${caseId}`);

    ws.onopen = () => console.log(`[WS] CaseDetail connected to case ${caseId}`);

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

    ws.onerror = () => console.log(`[WS] Error for case ${caseId}`);
    ws.onclose = () => console.log(`[WS] Disconnected from case ${caseId}`);

    return () => ws.close();
  }, [id, currentCase?.progress, currentCase?.status, dispatch]);

  const fetchDocumentAnalysis = useCallback(async (docId: number) => {
    if (!id) return;

    const docItem = (currentCase?.documents || []).find((d: any) => d.id === docId);
    if (docItem?.analysis_done && docItem?.document_analysis) {
      setDocumentAnalysis({ loading: false, done: true, text: docItem.document_analysis });
      return;
    }

    setDocumentAnalysis({ loading: true, done: false });
    try {
      const response = await documentAPI.analyzePage(parseInt(id), docId);
      if (response.data.analysis_done && response.data.document_analysis) {
        setDocumentAnalysis({ loading: false, done: true, text: response.data.document_analysis });
      } else {
        setDocumentAnalysis({ loading: false, done: false, text: '分析尚未完成，请等待后台处理完成后再查看。' });
      }
    } catch (err: any) {
      setDocumentAnalysis({ loading: false, done: false, error: err.response?.data?.detail || '获取分析结果失败' });
    }
  }, [id, currentCase]);

  const handleSelectDocument = useCallback(async (docId: number, loadFromBottom = false) => {
    if (isSwitchingDocRef.current) return;
    isSwitchingDocRef.current = true;

    setSelectedDocId(docId);
    setDocumentAnalysis({ loading: false, done: false });
    setPdfLoading(true);
    setLoadError(null);
    setNumPages(0);
    loadFromBottomRef.current = loadFromBottom;

    if (pdfBlobUrlRef.current) {
      URL.revokeObjectURL(pdfBlobUrlRef.current);
      pdfBlobUrlRef.current = null;
      setPdfBlobUrl(null);
      setPdfBlobRaw(null);
    }

    try {
      const [pdfResponse, ocrResponse] = await Promise.all([
        documentAPI.getDocumentFile(parseInt(id!), docId),
        documentAPI.getOCRResult(parseInt(id!), docId).catch(() => null),
      ]);

      const blobUrl = URL.createObjectURL(pdfResponse.data);
      pdfBlobUrlRef.current = blobUrl;
      setPdfBlobUrl(blobUrl);
      setPdfBlobRaw(pdfResponse.data);

      if (ocrResponse) {
        const pages = ocrResponse.data.ocr_result.pages || [];
        setTotalPages(pages.length);
        fetchDocumentAnalysis(docId);
      }
    } catch (err: any) {
      let errorMsg = '获取文档内容失败';
      if (err.response?.data) {
        if (err.response.data instanceof Blob) {
          try {
            const text = await err.response.data.text();
            const json = JSON.parse(text);
            errorMsg = json.detail || errorMsg;
          } catch {}
        } else if (err.response.data?.detail) {
          errorMsg = err.response.data.detail;
        }
      }
      setLoadError(errorMsg);
    } finally {
      setPdfLoading(false);
      isSwitchingDocRef.current = false;
    }
  }, [id, fetchDocumentAnalysis]);

  const handleBackToList = useCallback(() => {
    if (pdfBlobUrlRef.current) {
      URL.revokeObjectURL(pdfBlobUrlRef.current);
      pdfBlobUrlRef.current = null;
    }
    setSelectedDocId(null);
    setPdfBlobUrl(null);
    setPdfBlobRaw(null);
    setTotalPages(0);
    setNumPages(0);
    setDocumentAnalysis({ loading: false, done: false });
    setLoadError(null);
  }, []);

  const handleCategoryToggle = useCallback((catKey: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catKey)) {
        next.delete(catKey);
      } else {
        next.add(catKey);
      }
      return next;
    });
    setSelectedCategory(catKey);
  }, []);

  const menuItems = [
    { id: 'materials', label: '材料文档', icon: '📄' },
    { id: 'case-elements', label: '案件要素', icon: '📋' },
    { id: 'laws', label: '法律法规匹配', icon: '📜' },
    { id: 'reply', label: '答复归纳', icon: '📝' },
    { id: 'evidence', label: '证据审查', icon: '🔍' },
    { id: 'documents', label: '文书生成', icon: '📑' },
  ];

  const DIR_CATEGORIES = [
    { key: '1_财政厅移交材料', label: '1_财政厅移交材料', icon: '📂' },
    { key: '2_代理机构答复', label: '2_代理机构答复', icon: '📂' },
    { key: '3_采购人答复', label: '3_采购人答复', icon: '📂' },
    { key: '4_相关供应商答复', label: '4_相关供应商答复', icon: '📂' },
    { key: '5_评审材料', label: '5_评审材料', icon: '📂' },
  ];

  const allDocs = currentCase?.documents || [];
  const categoryDocCounts: Record<string, number> = {};
  allDocs.forEach((doc: any) => {
    const cat = doc.category || '1_财政厅移交材料';
    categoryDocCounts[cat] = (categoryDocCounts[cat] || 0) + 1;
  });
  const filteredDocuments = allDocs.filter((doc: any) =>
    (doc.category || '1_财政厅移交材料') === selectedCategory
  );

  const orderedDocs = DIR_CATEGORIES.reduce((acc: any[], cat) => {
    const catDocs = allDocs.filter((d: any) => (d.category || '1_财政厅移交材料') === cat.key);
    return [...acc, ...catDocs];
  }, []);

  const handleNextDocument = useCallback(async () => {
    if (!selectedDocId || isSwitchingDocRef.current) return;
    const idx = orderedDocs.findIndex((d: any) => d.id === selectedDocId);
    if (idx >= 0 && idx < orderedDocs.length - 1) {
      const nextDoc = orderedDocs[idx + 1];
      setSelectedCategory(nextDoc.category || '1_财政厅移交材料');
      await handleSelectDocument(nextDoc.id, false);
    }
  }, [selectedDocId, orderedDocs, handleSelectDocument]);

  const handlePrevDocument = useCallback(async () => {
    if (!selectedDocId || isSwitchingDocRef.current) return;
    const idx = orderedDocs.findIndex((d: any) => d.id === selectedDocId);
    if (idx > 0) {
      const prevDoc = orderedDocs[idx - 1];
      setSelectedCategory(prevDoc.category || '1_财政厅移交材料');
      await handleSelectDocument(prevDoc.id, true);
    }
  }, [selectedDocId, orderedDocs, handleSelectDocument]);

  const onDocumentLoadSuccess = useCallback(({ numPages: np }: { numPages: number }) => {
    setNumPages(np);
    setLoadError(null);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('[PDF] Document load error:', error);
    setLoadError(`PDF 加载失败: ${error.message}`);
    setPdfBlobRaw(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (isSwitchingDocRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 20) return;

    if (e.deltaY > 0) {
      if (scrollTop + clientHeight >= scrollHeight - 1) {
        e.preventDefault();
        handleNextDocument();
      }
    } else if (e.deltaY < 0) {
      if (scrollTop <= 0) {
        e.preventDefault();
        handlePrevDocument();
      }
    }
  }, [handleNextDocument, handlePrevDocument]);

  useEffect(() => {
    if (loadFromBottomRef.current && numPages > 0 && scrollContainerRef.current) {
      loadFromBottomRef.current = false;
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      });
    }
  }, [numPages]);

  const handleSelectFileFromDir = useCallback(async (docId: number) => {
    await handleSelectDocument(docId);
    const doc = allDocs.find((d: any) => d.id === docId);
    if (doc) {
      setSelectedCategory(doc.category || '1_财政厅移交材料');
    }
  }, [handleSelectDocument, allDocs]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!currentCase) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">案件不存在</p>
      </div>
    );
  }

  const complainant = currentCase.complainant || {};
  const respondent = currentCase.respondent || {};
  const projectInfo = currentCase.project_info || {};
  const complaintItems = currentCase.complaint_items || [];
  const analysisResult = currentCase.analysis_result || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <div className="sidebar w-28 min-h-screen bg-blue-700 flex flex-col text-white py-6">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 min-h-[60px] mx-2 mb-2 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all ${
                activeTab === item.id
                  ? 'bg-blue-500 shadow-lg'
                  : 'hover:bg-blue-600/50'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1">
          <div className="bg-white border-b border-gray-100 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-2xl">⚖️</div>
                <div>
                  <h1 className="text-xl font-bold text-gray-800">粤省法智能办案系统</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-blue-600 font-medium">当前案件：</span>
                    <span className="text-sm text-gray-600">{currentCase.case_name}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate('/workbench')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                返回首页
              </button>
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'case-elements' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm">
                  <div className="bg-gray-50 px-6 py-3 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800">主体基本信息</h2>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="border-b border-gray-100 pb-4">
                        <span className="text-sm text-gray-500">投诉企业</span>
                        <p className="text-gray-800 font-medium mt-1">
                          {(complainant as Record<string, unknown>).companyName as string || '-'}
                        </p>
                      </div>
                      <div className="border-b border-gray-100 pb-4">
                        <span className="text-sm text-gray-500">企业地址</span>
                        <p className="text-gray-800 font-medium mt-1">
                          {(complainant as Record<string, unknown>).address as string || '-'}
                        </p>
                      </div>
                      <div className="border-b border-gray-100 pb-4">
                        <span className="text-sm text-gray-500">投诉日期</span>
                        <p className="text-gray-800 font-medium mt-1">
                          {(complainant as Record<string, unknown>).complaintDate as string || '-'}
                        </p>
                      </div>
                      <div className="border-b border-gray-100 pb-4">
                        <span className="text-sm text-gray-500">是否已经质疑</span>
                        <p className={`text-sm font-medium mt-1 ${
                          (complainant as Record<string, unknown>).hasProtested === '已质疑'
                            ? 'text-orange-600'
                            : 'text-gray-600'
                        }`}>
                          {(complainant as Record<string, unknown>).hasProtested as string || '-'}
                        </p>
                      </div>
                      <div className="pt-4">
                        <span className="text-sm text-gray-500">被投诉企业</span>
                        <p className="text-gray-800 font-medium mt-1">
                          {(respondent as Record<string, unknown>).companyName as string || '-'}
                        </p>
                      </div>
                      <div className="pt-4">
                        <span className="text-sm text-gray-500">企业地址</span>
                        <p className="text-gray-800 font-medium mt-1">
                          {(respondent as Record<string, unknown>).address as string || '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm">
                  <div className="bg-gray-50 px-6 py-3 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800">案件事实信息</h2>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="border-b border-gray-100 pb-4">
                        <span className="text-sm text-gray-500">采购项目名称</span>
                        <p className="text-gray-800 font-medium mt-1">
                          {(projectInfo as Record<string, unknown>).projectName as string || '-'}
                        </p>
                      </div>
                      <div className="border-b border-gray-100 pb-4">
                        <span className="text-sm text-gray-500">采购项目编号</span>
                        <p className="text-gray-800 font-medium mt-1">
                          {(projectInfo as Record<string, unknown>).projectCode as string || '-'}
                        </p>
                      </div>
                      <div className="border-b border-gray-100 pb-4">
                        <span className="text-sm text-gray-500">中标企业</span>
                        <p className="text-gray-800 font-medium mt-1">
                          {(projectInfo as Record<string, unknown>).biddingCompany as string || '-'}
                        </p>
                      </div>
                      <div className="pt-4">
                        <span className="text-sm text-gray-500">采购人</span>
                        <p className="text-gray-800 font-medium mt-1">
                          {(projectInfo as Record<string, unknown>).purchaser as string || '-'}
                        </p>
                      </div>
                      <div className="pt-4">
                        <span className="text-sm text-gray-500">代理机构</span>
                        <p className="text-gray-800 font-medium mt-1">
                          {(projectInfo as Record<string, unknown>).agency as string || '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm">
                  <div className="bg-gray-50 px-6 py-3 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800">投诉事项具体内容</h2>
                  </div>
                  <div className="p-6">
                    {complaintItems.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">暂无投诉事项</p>
                    ) : (
                      complaintItems.map((item: Record<string, unknown>, index: number) => (
                        <div key={index} className="border-b border-gray-100 pb-6 mb-6 last:border-0 last:pb-0 last:mb-0">
                          <div className="flex items-center gap-3 mb-4">
                            <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-sm font-medium">
                              {item.title as string}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="lg:col-span-2">
                              <span className="text-sm text-gray-500">投诉内容</span>
                              <p className="text-gray-800 mt-1 leading-relaxed">
                                {item.content as string || '-'}
                              </p>
                            </div>
                            <div>
                              <span className="text-sm text-gray-500">法律依据</span>
                              <div className="mt-1 p-4 bg-gray-50 rounded-lg">
                                <p className="text-gray-800 text-sm leading-relaxed">
                                  {item.legalBasis as string || '-'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'materials' && (
              <div className="bg-white rounded-xl shadow-sm">
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-800">材料文档</h2>
                  {selectedDocId && (
                    <button
                      onClick={handleBackToList}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      返回文档列表
                    </button>
                  )}
                </div>

                {!selectedDocId ? (
                  <div className="flex gap-[10px] bg-blue-50 p-[10px]" style={{ height: 'calc(100vh - 155px)' }}>
                    <div className="w-[280px] shrink-0 bg-white flex flex-col rounded-l-lg overflow-hidden shadow-sm">
                      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
                        <h3 className="text-base font-semibold text-gray-700 flex items-center gap-2">
                          <span>📁</span> 项目文档
                        </h3>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {DIR_CATEGORIES.map((cat) => {
                          const count = categoryDocCounts[cat.key] || 0;
                          const isActive = selectedCategory === cat.key;
                          const isExpanded = expandedCategories.has(cat.key);
                          const catDocs = allDocs.filter((d: any) => (d.category || '1_财政厅移交材料') === cat.key);
                          return (
                            <div key={cat.key}>
                              <button
                                onClick={() => handleCategoryToggle(cat.key)}
                                className={`w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors ${
                                  isActive
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                <svg
                                  className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                                <span className="text-sm">{isExpanded ? '📂' : '📁'}</span>
                                <span className="text-sm truncate flex-1">{cat.label.replace(/^\d_/, '')}</span>
                                <span className={`text-xs shrink-0 font-medium ${count > 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                                  {count}
                                </span>
                              </button>
                              {isExpanded && catDocs.length > 0 && (
                                <div className="border-l-2 border-blue-100 ml-6">
                                  {catDocs.map((doc: any) => (
                                    <button
                                      key={doc.id}
                                      onClick={() => handleSelectFileFromDir(doc.id)}
                                      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors"
                                    >
                                      <span className="text-sm shrink-0">📄</span>
                                      <span className="text-sm text-gray-600 truncate flex-1">
                                        {doc.original_name}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {isExpanded && count === 0 && (
                                <div className="ml-6 px-3 py-2 text-xs text-gray-400">
                                  暂无文件
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 bg-white rounded-r-lg shadow-sm">
                      {filteredDocuments.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {filteredDocuments.map((doc: any) => (
                            <div
                              key={doc.id}
                              onClick={() => handleSelectDocument(doc.id)}
                              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer hover:border-blue-300 group bg-white"
                            >
                              <div className="flex items-center gap-3">
                                <div className="text-3xl">📄</div>
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-800 truncate group-hover:text-blue-600 transition-colors">
                                    {doc.original_name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(doc.uploaded_at).toLocaleDateString('zh-CN')}
                                  </p>
                                </div>
                              </div>
                              {doc.ocr_done ? (
                                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                  <p className="text-sm text-green-600">
                                    已识别 | 置信度: {(doc.ocr_confidence * 100).toFixed(1)}%
                                  </p>
                                  <p className="text-sm text-gray-400">共 {doc.page_count} 页</p>
                                  {doc.is_scanned && (
                                    <p className="text-xs text-orange-500 mt-1">扫描件</p>
                                  )}
                                </div>
                              ) : (
                                <div className="mt-3 p-3 bg-yellow-50 rounded-lg">
                                  <p className="text-sm text-yellow-600">OCR 处理中...</p>
                                </div>
                              )}
                              <div className="mt-3 text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                点击查看文档原件与AI分析 →
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                          <span className="text-5xl mb-4">📁</span>
                          <p className="text-sm">此目录下暂无文档</p>
                          <p className="text-xs mt-1">续传功能即将上线</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : pdfLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="ml-3 text-gray-500">正在加载文档原件...</span>
                  </div>
                ) : loadError ? (
                  <div className="p-6 text-center">
                    <p className="text-red-500 mb-4">{loadError}</p>
                    <button
                      onClick={handleBackToList}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      返回文档列表
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-[10px] bg-blue-50 p-[10px]" style={{ height: 'calc(100vh - 155px)' }}>
                    <div className="flex-[3] flex flex-row gap-[10px] min-w-0">
                      {isDirCollapsed ? (
                        <button
                          onClick={() => setIsDirCollapsed(false)}
                          className="w-[28px] shrink-0 bg-blue-500 flex flex-col items-center justify-center hover:bg-blue-600 transition-colors cursor-pointer rounded-l-lg shadow-sm"
                          title="展开目录"
                        >
                          <span className="text-xs text-white leading-relaxed">展</span>
                          <span className="text-xs text-white leading-relaxed">开</span>
                          <span className="text-xs text-white leading-relaxed">目</span>
                          <span className="text-xs text-white leading-relaxed">录</span>
                        </button>
                      ) : (
                        <div className="w-[240px] shrink-0 bg-white flex flex-col rounded-l-lg overflow-hidden shadow-sm">
                          <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50 shrink-0 flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-700 truncate">📁 项目文档</h4>
                            <button
                              onClick={() => setIsDirCollapsed(true)}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
                              title="收起目录"
                            >
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                              </svg>
                            </button>
                          </div>
                          <div className="flex-1 overflow-y-auto">
                            {DIR_CATEGORIES.map((cat) => {
                              const count = categoryDocCounts[cat.key] || 0;
                              const isActive = selectedCategory === cat.key;
                              const isExpanded = expandedCategories.has(cat.key);
                              const catDocs = allDocs.filter((d: any) => (d.category || '1_财政厅移交材料') === cat.key);
                              return (
                                <div key={cat.key}>
                                  <button
                                    onClick={() => handleCategoryToggle(cat.key)}
                                    className={`w-full text-left px-3 py-2 flex items-center gap-1.5 transition-colors ${
                                      isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                                  >
                                    <svg
                                      className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                    </svg>
                                    <span className="text-sm">{isExpanded ? '📂' : '📁'}</span>
                                    <span className="text-sm truncate flex-1">{cat.label.replace(/^\d_/, '')}</span>
                                    <span className={`text-xs shrink-0 font-medium ${count > 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                                      {count}
                                    </span>
                                  </button>
                                  {isExpanded && catDocs.length > 0 && (
                                    <div className="border-l-2 border-blue-100 ml-4">
                                      {catDocs.map((doc: any) => (
                                        <button
                                          key={doc.id}
                                          onClick={() => handleSelectFileFromDir(doc.id)}
                                          className={`w-full text-left px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                                            selectedDocId === doc.id
                                              ? 'bg-blue-100 text-blue-700'
                                              : 'hover:bg-gray-50 text-gray-500'
                                          }`}
                                        >
                                          <span className="text-xs shrink-0">📄</span>
                                          <span className="text-sm truncate flex-1">
                                            {doc.original_name}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {isExpanded && count === 0 && (
                                    <div className="ml-4 px-3 py-1.5 text-xs text-gray-400">
                                      暂无文件
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="flex-1 min-w-0 relative">
                        <div
                          ref={scrollContainerRef}
                          onWheel={handleWheel}
                          className="h-full overflow-y-auto bg-[#525659]"
                        >
                          {pdfBlobRaw ? (
                            <div className="flex justify-center min-h-full">
                              <Document
                                file={pdfBlobRaw}
                                onLoadSuccess={onDocumentLoadSuccess}
                                onLoadError={onDocumentLoadError}
                                loading={
                                  <div className="flex items-center justify-center py-32">
                                    <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                                  </div>
                                }
                                error={
                                  <div className="flex items-center justify-center h-full py-32">
                                    <p className="text-gray-400">PDF 无法解析，请确认文件格式</p>
                                  </div>
                                }
                              >
                                {Array.from(new Array(numPages || 1), (_, idx) => (
                                  <Page
                                    key={`page_${idx + 1}`}
                                    pageNumber={idx + 1}
                                    width={700}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                    className="mb-1"
                                    loading={
                                      <div className="w-[700px] h-[990px] bg-[#525659] flex items-center justify-center">
                                        <div className="w-6 h-6 border-3 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                      </div>
                                    }
                                  />
                                ))}
                              </Document>
                            </div>
                          ) : selectedDocId && !pdfLoading && !loadError ? (
                            <div className="flex items-center justify-center h-full">
                              <p className="text-gray-400">文档数据加载中...</p>
                            </div>
                          ) : null}
                        </div>
                        {selectedDocId && orderedDocs.findIndex((d: any) => d.id === selectedDocId) > 0 && (
                          <button
                            onClick={handlePrevDocument}
                            className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/40 text-white text-xs rounded-full hover:bg-black/60 transition-all z-10 backdrop-blur-sm"
                            title="上一份文档"
                          >
                            ▲ 上一份
                          </button>
                        )}
                        {selectedDocId && orderedDocs.findIndex((d: any) => d.id === selectedDocId) < orderedDocs.length - 1 && (
                          <button
                            onClick={handleNextDocument}
                            className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/40 text-white text-xs rounded-full hover:bg-black/60 transition-all z-10 backdrop-blur-sm"
                            title="下一份文档"
                          >
                            ▼ 下一份
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex-[2] flex flex-col bg-white rounded-r-lg overflow-hidden shadow-sm">
                      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 shrink-0">
                        <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                          <span>🤖</span> AI 文档分析
                        </h3>
                      </div>

                      <div className="px-4 py-2.5 border-b border-gray-100 bg-white shrink-0">
                        {selectedDocId && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              文档：{orderedDocs.find((d: any) => d.id === selectedDocId)?.original_name || '未知'}
                            </span>
                            <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded">
                              {documentAnalysis.done ? '已分析' : documentAnalysis.loading ? '加载中...' : '未分析'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 overflow-y-auto">
                        {documentAnalysis.loading ? (
                          <div className="flex flex-col items-center justify-center py-16">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-sm text-gray-500">正在获取分析结果...</p>
                          </div>
                        ) : documentAnalysis.done && documentAnalysis.text ? (
                          <div className="p-4">
                            <div className="markdown-content">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {documentAnalysis.text}
                              </ReactMarkdown>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                              <span className="text-xs text-gray-400">MiniMax-M2.7-highspeed · 上传阶段自动分析</span>
                            </div>
                          </div>
                        ) : documentAnalysis.error ? (
                          <div className="p-4 text-center">
                            <div className="p-4 bg-red-50 rounded-lg mb-4">
                              <p className="text-sm text-red-600">{documentAnalysis.error}</p>
                            </div>
                          </div>
                        ) : selectedDocId ? (
                          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                            <div className="text-4xl mb-4">📋</div>
                            <p className="text-sm text-gray-600 font-medium mb-2">文档分析</p>
                            <p className="text-xs text-gray-400 mb-2 leading-relaxed">
                              AI 已在上传处理阶段完成分析<br />
                              文档分析结果将在此显示
                            </p>
                            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg mb-3">
                              等待后台处理完成后自动显示
                            </p>
                            {currentCase && currentCase.progress > 0 && currentCase.progress < 100 && (
                              <div className="w-full max-w-xs">
                                <div className="bg-gray-100 rounded-full h-2.5 mb-2 overflow-hidden">
                                  <div
                                    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2.5 rounded-full transition-all duration-700 ease-out"
                                    style={{ width: `${currentCase.progress}%` }}
                                  />
                                </div>
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                  <span>{currentCase.processing_message || '处理中...'}</span>
                                  <span className="font-semibold text-blue-600">{currentCase.progress}%</span>
                                </div>
                                {currentCase.processing_status && (
                                  <div className="mt-1.5 flex items-center justify-between text-xs">
                                    <span className={`px-2 py-0.5 rounded-full font-medium ${
                                      currentCase.processing_status.status === 'ocr_processing' ? 'bg-blue-50 text-blue-600' :
                                      currentCase.processing_status.status === 'vector_processing' ? 'bg-purple-50 text-purple-600' :
                                      currentCase.processing_status.status === 'auto_analysis' ? 'bg-indigo-50 text-indigo-600' :
                                      currentCase.processing_status.status === 'element_extraction' ? 'bg-green-50 text-green-600' :
                                      'bg-gray-50 text-gray-600'
                                    }`}>
                                      {currentCase.processing_status.status === 'ocr_processing' && '🔍 OCR 识别中'}
                                      {currentCase.processing_status.status === 'vector_processing' && '🧠 构建知识库'}
                                      {currentCase.processing_status.status === 'auto_analysis' && '🤖 AI 分析中'}
                                      {currentCase.processing_status.status === 'element_extraction' && '📋 提取案件要素'}
                                      {currentCase.processing_status.status === 'ai_done' && '✅ 已完成'}
                                      {!['ocr_processing', 'vector_processing', 'auto_analysis', 'element_extraction', 'ai_done'].includes(currentCase.processing_status.status) && currentCase.processing_status.status}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center py-16">
                            <p className="text-sm text-gray-400">请先在左侧选择文档</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'laws' && (
              <div className="bg-white rounded-xl shadow-sm">
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800">法律法规匹配</h2>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">《中华人民共和国招标投标法》</h3>
                      <p className="text-sm text-gray-600">
                        第五十四条 投标人以他人名义投标或者以其他方式弄虚作假，骗取中标的，中标无效，
                        给招标人造成损失的，依法承担赔偿责任；构成犯罪的，依法追究刑事责任。
                      </p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">《中华人民共和国招标投标法实施条例》</h3>
                      <p className="text-sm text-gray-600">
                        第五十一条 有下列情形之一的，评标委员会应当否决其投标：
                        （七）投标人有串通投标、弄虚作假、行贿等违法行为。
                      </p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">《政府采购促进中小企业发展管理办法》</h3>
                      <p className="text-sm text-gray-600">
                        第二十条 投标人应当对其出具的《中小企业声明函》真实性负责。
                        投标人出具的《中小企业声明函》内容不实的，属于提供虚假材料谋取中标。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'reply' && (
              <div className="bg-white rounded-xl shadow-sm">
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800">答复归纳</h2>
                </div>
                <div className="p-6">
                  <div className="p-6 bg-blue-50 rounded-lg">
                    <h3 className="font-semibold text-gray-800 mb-3">处理建议</h3>
                    <p className="text-gray-700 leading-relaxed">
                      {(analysisResult as Record<string, unknown>).suggestions as string ||
                        '根据案件分析结果，建议：1. 核实中标企业的真实资质情况；2. 审查招标流程是否合规；3. 根据相关法律法规作出处理决定。'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'evidence' && (
              <div className="bg-white rounded-xl shadow-sm">
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800">证据审查</h2>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-800">投诉材料真实性</p>
                        <p className="text-sm text-gray-500">投诉企业提供的材料完整</p>
                      </div>
                      <span className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-sm font-medium">✓ 通过</span>
                    </div>
                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-800">中标企业资质证明</p>
                        <p className="text-sm text-gray-500">需核实企业规模认定</p>
                      </div>
                      <span className="px-3 py-1 bg-yellow-50 text-yellow-600 rounded-full text-sm font-medium">待核实</span>
                    </div>
                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-800">招标流程合规性</p>
                        <p className="text-sm text-gray-500">评审过程需进一步核查</p>
                      </div>
                      <span className="px-3 py-1 bg-yellow-50 text-yellow-600 rounded-full text-sm font-medium">待核实</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="bg-white rounded-xl shadow-sm">
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800">文书生成</h2>
                </div>
                <div className="p-6">
                  <div className="p-6 bg-gray-50 rounded-lg">
                    <p className="text-gray-600 text-center">
                      📝 文书生成功能正在开发中，即将上线！
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaseDetail;
