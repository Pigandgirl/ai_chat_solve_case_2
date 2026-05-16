import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchCaseById } from '../store/slices/caseSlice';
import { RootState, AppDispatch } from '../store';

const CaseDetail = () => {
  const [activeTab, setActiveTab] = useState('case-elements');
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { currentCase, isLoading } = useSelector((state: RootState) => state.case);

  useEffect(() => {
    if (id) {
      dispatch(fetchCaseById(parseInt(id)));
    }
  }, [dispatch, id]);

  const menuItems = [
    { id: 'materials', label: '材料文档', icon: '📄' },
    { id: 'case-elements', label: '案件要素', icon: '📋' },
    { id: 'laws', label: '法律法规匹配', icon: '📜' },
    { id: 'reply', label: '答复归纳', icon: '📝' },
    { id: 'evidence', label: '证据审查', icon: '🔍' },
    { id: 'documents', label: '文书生成', icon: '📑' },
  ];

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
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800">材料文档</h2>
                </div>
                <div className="p-6">
                  {currentCase.documents && currentCase.documents.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {currentCase.documents.map((doc) => (
                        <div key={doc.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3">
                            <div className="text-3xl">📄</div>
                            <div>
                              <p className="font-medium text-gray-800 truncate">{doc.original_name}</p>
                              <p className="text-xs text-gray-500">
                                {new Date(doc.uploaded_at).toLocaleDateString('zh-CN')}
                              </p>
                            </div>
                          </div>
                          {doc.ocr_done && (
                            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                              <p className="text-sm text-green-600">
                                已识别 | 置信度: {(doc.ocr_confidence * 100).toFixed(1)}%
                              </p>
                              {doc.is_scanned && (
                                <p className="text-xs text-orange-500 mt-1">扫描件</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">暂无上传的材料文档</p>
                  )}
                </div>
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
