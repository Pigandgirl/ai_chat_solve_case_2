import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { documentAPI, caseAPI } from '../api';
import { OCRResultResponse, CaseItem } from '../types';

interface EditedBlock {
  pageNum: number;
  blockIndex: number;
  originalText: string;
  newText: string;
}

const CONFIDENCE_THRESHOLD = 0.8;

const OCRVerification = () => {
  const { caseId, documentId } = useParams<{ caseId: string; documentId: string }>();
  const navigate = useNavigate();

  const [ocrData, setOcrData] = useState<OCRResultResponse | null>(null);
  const [caseData, setCaseData] = useState<CaseItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPage, setSelectedPage] = useState(1);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyLowConf, setShowOnlyLowConf] = useState(false);
  const [previewMode, setPreviewMode] = useState<'text' | 'side-by-side'>('text');

  useEffect(() => {
    const fetchData = async () => {
      if (!caseId || !documentId) return;
      setIsLoading(true);
      setError(null);
      try {
        const [ocrRes, caseRes] = await Promise.all([
          documentAPI.getOCRResult(parseInt(caseId), parseInt(documentId)),
          caseAPI.getCaseById(parseInt(caseId)),
        ]);
        setOcrData(ocrRes.data);
        setCaseData(caseRes.data);
      } catch (err: any) {
        setError(err.response?.data?.detail || '加载 OCR 结果失败');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [caseId, documentId]);

  const handleEdit = useCallback((pageNum: number, blockIndex: number, text: string) => {
    const key = `${pageNum}-${blockIndex}`;
    setEdits(prev => ({ ...prev, [key]: text }));
  }, []);

  const getEditKey = (pageNum: number, blockIndex: number) => `${pageNum}-${blockIndex}`;

  const getCurrentText = (pageNum: number, blockIndex: number, original: string) => {
    const key = getEditKey(pageNum, blockIndex);
    return edits[key] !== undefined ? edits[key] : original;
  };

  const isEdited = (pageNum: number, blockIndex: number) =>
    edits[getEditKey(pageNum, blockIndex)] !== undefined;

  const resetAllEdits = () => setEdits({});

  const handleSaveCorrections = async () => {
    if (!ocrData || !caseId || !documentId) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const correctedOcr = JSON.parse(JSON.stringify(ocrData.ocr_result));
      let modifiedCount = 0;
      correctedOcr.pages = correctedOcr.pages.map((page: any) => {
        const newBlocks = page.blocks.map((block: any, idx: number) => {
          const key = getEditKey(page.page_num, idx);
          if (edits[key] !== undefined) {
            modifiedCount++;
            return { ...block, text: edits[key] };
          }
          return block;
        });
        return {
          ...page,
          blocks: newBlocks,
          text: newBlocks.map((b: any) => b.text).join('\n'),
        };
      });
      await documentAPI.updateOCRResult(
        parseInt(caseId),
        parseInt(documentId),
        correctedOcr
      );
      setSaveSuccess(true);
      setEdits({});
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(`保存失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getConfidenceLevel = (confidence: number) => {
    if (confidence >= 0.9) return { label: '高', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500' };
    if (confidence >= 0.8) return { label: '中', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-500' };
    if (confidence >= 0.6) return { label: '低', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-300', bar: 'bg-orange-500' };
    return { label: '极低', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-300', bar: 'bg-red-500' };
  };

  const lowConfBlocks = useMemo(() =>
    ocrData?.low_confidence_blocks || [],
    [ocrData]
  );

  const currentPage = useMemo(() =>
    ocrData?.ocr_result.pages.find(p => p.page_num === selectedPage),
    [ocrData, selectedPage]
  );

  const displayBlocks = useMemo(() => {
    if (!currentPage) return [];
    if (!showOnlyLowConf) return currentPage.blocks;
    return currentPage.blocks.filter(b => b.confidence < CONFIDENCE_THRESHOLD);
  }, [currentPage, showOnlyLowConf]);

  const totalLowConfThisPage = useMemo(() =>
    currentPage ? currentPage.blocks.filter(b => b.confidence < CONFIDENCE_THRESHOLD).length : 0,
    [currentPage]
  );

  const editCount = useMemo(() => Object.keys(edits).length, [edits]);

  // Navigate to next low-conf page
  const goToNextLowConfPage = useCallback(() => {
    const pagesWithLow = ocrData?.ocr_result.pages
      .filter(p => p.blocks.some(b => b.confidence < CONFIDENCE_THRESHOLD))
      .map(p => p.page_num) || [];
    const idx = pagesWithLow.findIndex(p => p > selectedPage);
    if (idx >= 0) setSelectedPage(pagesWithLow[idx]);
  }, [ocrData, selectedPage]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-gray-600 text-lg font-medium">正在加载 OCR 识别结果...</p>
          <p className="text-gray-400 text-sm mt-2">请稍候</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">加载失败</h2>
          <p className="text-gray-500 mb-6">{error}</p>
          <button onClick={() => navigate(-1)} className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-semibold shadow-lg hover:shadow-xl">
            返回上一页
          </button>
        </div>
      </div>
    );
  }

  if (!ocrData || !caseData) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Top Bar */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(`/case/${caseId}`)}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                返回案件
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-800">OCR 结果验证与人工修正</h1>
                <p className="text-gray-500 text-xs mt-0.5">
                  {caseData.case_name} · {ocrData.document.original_name}
                </p>
              </div>
            </div>

            {/* Stats Pills */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-1.5">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-semibold text-gray-700">{ocrData.ocr_result.total_pages} 页</span>
              </div>
              <div className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${ocrData.ocr_result.overall_confidence >= 0.9 ? 'bg-emerald-100' : ocrData.ocr_result.overall_confidence >= 0.8 ? 'bg-amber-100' : 'bg-red-100'}`}>
                <svg className={`w-4 h-4 ${ocrData.ocr_result.overall_confidence >= 0.9 ? 'text-emerald-600' : ocrData.ocr_result.overall_confidence >= 0.8 ? 'text-amber-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-semibold">{(ocrData.ocr_result.overall_confidence * 100).toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2 bg-orange-100 rounded-xl px-3 py-1.5">
                <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm font-semibold text-orange-700">{lowConfBlocks.length} 处待审核</span>
              </div>
              {editCount > 0 && (
                <div className="flex items-center gap-2 bg-blue-100 rounded-xl px-3 py-1.5">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-sm font-semibold text-blue-700">{editCount} 处已修改</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Page Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-md p-5 sticky top-24">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                页面导航
              </h3>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {ocrData.ocr_result.pages.map(page => {
                  const pageLowConf = lowConfBlocks.filter(b => b.page_num === page.page_num).length;
                  const isActive = selectedPage === page.page_num;
                  const confLevel = getConfidenceLevel(page.confidence);
                  return (
                    <button
                      key={page.page_num}
                      onClick={() => setSelectedPage(page.page_num)}
                      className={`w-full text-left p-3 rounded-xl transition-all duration-200 ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-lg scale-[1.02]'
                          : 'hover:bg-gray-100 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold ${isActive ? 'text-white' : 'text-gray-800'}`}>
                          第 {page.page_num} 页
                        </span>
                        <div className="flex items-center gap-1.5">
                          {pageLowConf > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              isActive ? 'bg-white/25 text-white' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {pageLowConf}
                            </span>
                          )}
                          <span className={`text-xs font-mono ${isActive ? 'text-blue-100' : 'text-gray-400'}`}>
                            {(page.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      {isActive && (
                        <div className="mt-2 w-full bg-white/20 rounded-full h-1">
                          <div className="bg-white h-1 rounded-full" style={{ width: `${page.confidence * 100}%` }} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Low Confidence Summary */}
              {lowConfBlocks.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      需人工审核
                    </h4>
                    <button
                      onClick={goToNextLowConfPage}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      下一处 →
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {lowConfBlocks.map((block, idx) => {
                      const level = getConfidenceLevel(block.confidence);
                      return (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-lg border cursor-pointer hover:shadow-sm transition-all ${level.bg} ${level.border}`}
                          onClick={() => setSelectedPage(block.page_num)}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`text-xs font-semibold ${level.color}`}>第{block.page_num}页</span>
                            <span className={`text-xs font-mono font-bold ${level.color}`}>
                              {(block.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 line-clamp-2">{block.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Main Content */}
          <div className="lg:col-span-3 space-y-4">
            {/* Filter Bar */}
            <div className="bg-white rounded-2xl shadow-sm p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOnlyLowConf}
                    onChange={e => setShowOnlyLowConf(e.target.checked)}
                    className="w-4 h-4 text-orange-500 rounded focus:ring-orange-400"
                  />
                  <span className="text-sm text-gray-600">仅显示低置信度文本</span>
                </label>
                {showOnlyLowConf && (
                  <span className="text-xs text-orange-500 font-medium">
                    显示 {displayBlocks.length}/{currentPage?.blocks.length || 0} 个文本块
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewMode(previewMode === 'text' ? 'side-by-side' : 'text')}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {previewMode === 'text' ? '纯文本模式' : '预览模式'}
                </button>
              </div>
            </div>

            {/* Main Content Card */}
            <div className="bg-white rounded-2xl shadow-md overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">
                    第 {selectedPage} 页识别结果
                  </h3>
                  {totalLowConfThisPage > 0 && (
                    <p className="text-xs text-orange-500 mt-0.5">
                      本页有 {totalLowConfThisPage} 处低置信度文本需要审核
                    </p>
                  )}
                </div>
                {currentPage && (
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${getConfidenceLevel(currentPage.confidence).color} ${getConfidenceLevel(currentPage.confidence).bg} border ${getConfidenceLevel(currentPage.confidence).border}`}>
                      本页置信度 {(currentPage.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>

              <div className="p-6 max-h-[640px] overflow-y-auto">
                {!currentPage || currentPage.blocks.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>该页未检测到文本内容</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {displayBlocks.map((block, idx) => {
                      const isLowConf = block.confidence < CONFIDENCE_THRESHOLD;
                      const edited = isEdited(selectedPage, idx);
                      const currentText = getCurrentText(selectedPage, idx, block.text);
                      const level = getConfidenceLevel(block.confidence);

                      return (
                        <div
                          key={idx}
                          className={`group rounded-xl border-2 transition-all duration-200 ${
                            edited
                              ? 'border-blue-400 bg-blue-50/30 shadow-md'
                              : isLowConf
                              ? 'border-orange-300 bg-orange-50/20'
                              : 'border-gray-100 bg-white hover:border-gray-300'
                          }`}
                        >
                          {/* Block Header */}
                          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                                {idx + 1}
                              </span>
                              {isLowConf && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${level.color} ${level.bg} border ${level.border}`}>
                                  ⚠ 低置信度
                                </span>
                              )}
                              {edited && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold text-blue-700 bg-blue-100 border border-blue-200">
                                  已修改
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              {/* Confidence Meter */}
                              <div className="flex items-center gap-1.5">
                                <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${level.bar}`}
                                    style={{ width: `${block.confidence * 100}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-mono font-bold ${level.color}`}>
                                  {(block.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Block Content */}
                          <div className="px-4 py-3">
                            <textarea
                              value={currentText}
                              onChange={e => handleEdit(selectedPage, idx, e.target.value)}
                              className={`w-full p-3 rounded-lg border resize-none focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none transition-all text-sm leading-relaxed ${
                                edited
                                  ? 'border-blue-300 bg-white ring-1 ring-blue-200'
                                  : isLowConf
                                  ? 'border-orange-200 bg-white ring-1 ring-orange-100'
                                  : 'border-gray-200 bg-gray-50'
                              }`}
                              rows={Math.max(2, Math.min(6, Math.ceil(currentText.length / 40)))}
                              placeholder="编辑识别文本..."
                            />
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-xs text-gray-400">
                                {currentText.length} 字符
                              </span>
                              {edited && (
                                <button
                                  onClick={() => {
                                    const key = getEditKey(selectedPage, idx);
                                    const newEdits = { ...edits };
                                    delete newEdits[key];
                                    setEdits(newEdits);
                                  }}
                                  className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                                >
                                  撤销修改
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Action Bar */}
              <div className="px-6 py-4 border-t border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    共 {currentPage?.blocks.length || 0} 个文本块
                    {showOnlyLowConf && ` · 显示 ${displayBlocks.length} 个低置信度块`}
                  </span>
                  {editCount > 0 && (
                    <span className="text-sm text-blue-600 font-semibold">
                      已修改 {editCount} 处
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={resetAllEdits}
                    disabled={editCount === 0}
                    className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all font-semibold disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                  >
                    重置全部修改
                  </button>
                  <button
                    onClick={handleSaveCorrections}
                    disabled={editCount === 0 || isSaving}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all font-semibold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        保存中...
                      </>
                    ) : saveSuccess ? (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        保存成功 ✓
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        保存修改并覆盖原OCR结果
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Success Toast */}
      {saveSuccess && (
        <div className="fixed bottom-8 right-8 bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce z-50">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-bold">修正已保存，已覆盖原OCR结果</span>
        </div>
      )}
    </div>
  );
};

export default OCRVerification;
