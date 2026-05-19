import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { adminAPI } from '../api';

interface AdminUser {
  id: number;
  username: string;
  phone: string;
  email: string | null;
  role: string;
  created_at: string | null;
}

interface AdminCase {
  id: number;
  case_name: string;
  case_type: string;
  status: string;
  progress: number;
  user_id: number;
  username: string;
  created_at: string | null;
}

interface AuditLogEntry {
  id: number;
  user_id: number;
  username: string;
  action: string;
  created_at: string | null;
}

export default function Admin() {
  const navigate = useNavigate();
  const authUser = useSelector((state: RootState) => state.auth.user);
  const [activeTab, setActiveTab] = useState<'users' | 'cases' | 'audit'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allCases, setAllCases] = useState<AdminCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [caseSearch, setCaseSearch] = useState('');
  const [caseTypeFilter, setCaseTypeFilter] = useState('');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ username: '', phone: '', role: '' });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'user' | 'case';
    id: number;
    name: string;
    desc?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<AdminUser | null>(null);
  const [pwdForm, setPwdForm] = useState({ adminPassword: '', newPassword: '' });
  const [pwdChanging, setPwdChanging] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(20);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditTotalPages, setAuditTotalPages] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.listUsers(userSearch || undefined);
      setUsers(data.users);
    } catch {
      showMsg('error', '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [userSearch]);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.listAllCases({
        search: caseSearch || undefined,
        case_type: caseTypeFilter || undefined,
      });
      setAllCases(data.cases);
    } catch {
      showMsg('error', '获取案件列表失败');
    } finally {
      setLoading(false);
    }
  }, [caseSearch, caseTypeFilter]);

  const fetchAuditLogs = useCallback(async (page?: number, pageSize?: number) => {
    const p = page ?? auditPage;
    const ps = pageSize ?? auditPageSize;
    setAuditLoading(true);
    try {
      const { data } = await adminAPI.listAuditLogs({ page: p, page_size: ps });
      setAuditLogs(data.items);
      setAuditTotal(data.total);
      setAuditTotalPages(data.total_pages);
      setAuditPage(data.page);
    } catch {
      showMsg('error', '获取审计日志失败');
    } finally {
      setAuditLoading(false);
    }
  }, [auditPage, auditPageSize]);

  useEffect(() => {
    if (!authUser || authUser.role !== 'admin') {
      navigate('/workbench');
      return;
    }
    if (activeTab === 'users') fetchUsers();
    else if (activeTab === 'cases') fetchCases();
    else if (activeTab === 'audit') fetchAuditLogs();
  }, [authUser, navigate, activeTab, fetchUsers, fetchCases, fetchAuditLogs]);

  const handleDeleteUser = (userId: number, username: string) => {
    setDeleteTarget({
      type: 'user',
      id: userId,
      name: username,
      desc: `用户「${username}」及其所有关联案件将被永久删除，此操作不可恢复。`,
    });
  };

  const openEditUser = (user: AdminUser) => {
    setEditingUser(user);
    setEditForm({ username: user.username, phone: user.phone, role: user.role });
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      await adminAPI.updateUser(editingUser.id, {
        username: editForm.username,
        phone: editForm.phone,
        role: editForm.role,
      });
      showMsg('success', '用户更新成功');
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      showMsg('error', err.response?.data?.detail || '更新失败');
    }
  };

  const handleDeleteCase = (caseId: number, caseName: string) => {
    setDeleteTarget({
      type: 'case',
      id: caseId,
      name: caseName,
      desc: `案件「${caseName}」及其所有关联数据将被永久删除，此操作不可恢复。`,
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === 'user') {
        const { data } = await adminAPI.deleteUser(deleteTarget.id);
        showMsg('success', data.message);
        fetchUsers();
      } else {
        await adminAPI.deleteCase(deleteTarget.id);
        showMsg('success', '案件已删除');
        fetchCases();
      }
    } catch {
      showMsg('error', '删除失败');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const openChangePwd = (user: AdminUser) => {
    setPwdTarget(user);
    setPwdForm({ adminPassword: '', newPassword: '' });
  };

  const handleChangePwd = async () => {
    if (!pwdTarget) return;
    if (!pwdForm.adminPassword) {
      showMsg('error', '请输入管理员密码');
      return;
    }
    if (!pwdForm.newPassword || pwdForm.newPassword.length < 6) {
      showMsg('error', '新密码至少6位');
      return;
    }
    setPwdChanging(true);
    try {
      const { data } = await adminAPI.changeUserPassword(pwdTarget.id, {
        admin_password: pwdForm.adminPassword,
        new_password: pwdForm.newPassword,
      });
      showMsg('success', data.message);
      setPwdTarget(null);
    } catch (err: any) {
      showMsg('error', err.response?.data?.detail || '密码修改失败');
    } finally {
      setPwdChanging(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      '待处理': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      '处理中': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      '已完成': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      'failed': 'bg-red-500/10 text-red-400 border-red-500/20',
    };
    return `px-2 py-0.5 rounded text-xs border ${map[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`;
  };

  const actionBadge = (action: string) => {
    const map: Record<string, string> = {
      '登录系统': 'bg-blue-50 text-blue-700',
      '上传文档': 'bg-purple-50 text-purple-700',
      '续传文档': 'bg-indigo-50 text-indigo-700',
      '删除文档': 'bg-red-50 text-red-700',
      '办理案件': 'bg-emerald-50 text-emerald-700',
      '筛选查询': 'bg-cyan-50 text-cyan-700',
      '下载文书': 'bg-amber-50 text-amber-700',
    };
    return map[action] || 'bg-gray-50 text-gray-600';
  };

  const actionIcon = (action: string) => {
    const icons: Record<string, string> = {
      '登录系统': '🔑',
      '上传文档': '📤',
      '续传文档': '🔄',
      '删除文档': '🗑️',
      '办理案件': '📋',
      '筛选查询': '🔍',
      '下载文书': '📥',
    };
    return icons[action] || '📌';
  };

  if (!authUser || authUser.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className="sidebar w-64 min-h-screen flex flex-col text-white bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 shadow-2xl">
        <div className="p-6 text-center border-b border-white/5">
          <div className="text-4xl mb-2">🛡️</div>
          <h1 className="text-lg font-bold tracking-wide">系统后台管理</h1>
          <div className="mt-2 px-3 py-1 bg-white/5 rounded-full text-xs text-slate-400">管理员：{authUser.username}</div>
        </div>

        <nav className="mt-6 flex-1 px-4 space-y-1">
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all ${
              activeTab === 'users'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            用户管理
          </button>
          <button
            onClick={() => setActiveTab('cases')}
            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all ${
              activeTab === 'cases'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            案件管理
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all ${
              activeTab === 'audit'
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            审计日志
          </button>
        </nav>

        <button
          onClick={() => navigate('/workbench')}
          className="mx-4 mb-4 px-5 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-slate-400 transition-all flex items-center justify-center gap-2"
        >
          ← 返回工作台
        </button>
      </div>

      <div className="flex-1 p-6">
        {message && (
          <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {activeTab === 'users' && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-gray-800">用户列表</h2>
                <input
                  type="text"
                  placeholder="搜索用户名..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="ml-auto px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                />
                <button
                  onClick={fetchUsers}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  搜索
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3">ID</th>
                    <th className="px-6 py-3">用户名</th>
                    <th className="px-6 py-3">手机号</th>
                    <th className="px-6 py-3">角色</th>
                    <th className="px-6 py-3">创建时间</th>
                    <th className="px-6 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">加载中...</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">暂无用户</td></tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-600 font-mono">{u.id}</td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-800">{u.username}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{u.phone}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {u.role === 'admin' ? '管理员' : '普通用户'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-400">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditUser(u)}
                              className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => openChangePwd(u)}
                              className="px-3 py-1 text-xs bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"
                            >
                              改密
                            </button>
                            {u.role !== 'admin' && (
                              <button
                                onClick={() => handleDeleteUser(u.id, u.username)}
                                className="px-3 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                              >
                                删除
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'cases' && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
              <div className="flex items-center gap-4 flex-wrap">
                <h2 className="text-lg font-bold text-gray-800">全部案件</h2>
                <input
                  type="text"
                  placeholder="搜索案件名称..."
                  value={caseSearch}
                  onChange={(e) => setCaseSearch(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                />
                <select
                  value={caseTypeFilter}
                  onChange={(e) => setCaseTypeFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">全部类型</option>
                  <option value="招标投诉">招标投诉</option>
                  <option value="招标审查">招标审查</option>
                </select>
                <button
                  onClick={fetchCases}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors ml-auto"
                >
                  搜索
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3">ID</th>
                    <th className="px-6 py-3">案件名称</th>
                    <th className="px-6 py-3">类型</th>
                    <th className="px-6 py-3">状态</th>
                    <th className="px-6 py-3">进度</th>
                    <th className="px-6 py-3">账户名称</th>
                    <th className="px-6 py-3">创建时间</th>
                    <th className="px-6 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">加载中...</td></tr>
                  ) : allCases.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">暂无案件</td></tr>
                  ) : (
                    allCases.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-600 font-mono">{c.id}</td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-800 max-w-xs truncate">{c.case_name}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{c.case_type || '-'}</td>
                        <td className="px-6 py-4"><span className={statusBadge(c.status)}>{c.status}</span></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${c.progress}%`,
                                  background: c.progress >= 100 ? '#10b981' : '#3b82f6',
                                }}
                              />
                            </div>
                            <span className="text-xs text-gray-400">{c.progress}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{c.username || `用户#${c.user_id}`}</td>
                        <td className="px-6 py-4 text-sm text-gray-400">
                          {c.created_at ? new Date(c.created_at).toLocaleDateString('zh-CN') : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleDeleteCase(c.id, c.case_name)}
                            className="px-3 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'audit' && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-gray-800">用户操作审计日志</h2>
                <p className="text-sm text-gray-400 ml-auto">共 {auditTotal} 条记录</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3 w-20">序号</th>
                    <th className="px-6 py-3">用户名</th>
                    <th className="px-6 py-3">操作时间</th>
                    <th className="px-6 py-3">操作内容</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {auditLoading ? (
                    <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-400">加载中...</td></tr>
                  ) : auditLogs.length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-400">暂无审计记录</td></tr>
                  ) : (
                    auditLogs.map((log, idx) => (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                          {(auditPage - 1) * auditPageSize + idx + 1}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-800">{log.username}</td>
                        <td className="px-6 py-4 text-sm text-gray-400">
                          {log.created_at ? new Date(log.created_at).toLocaleString('zh-CN') : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${actionBadge(log.action)}`}>
                            {actionIcon(log.action)}
                            {log.action}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {auditTotalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">每页</span>
                    {[20, 50, 100].map((size) => (
                      <button
                        key={size}
                        onClick={() => {
                          const newSize = size;
                          setAuditPageSize(newSize);
                          setAuditPage(1);
                          fetchAuditLogs(1, newSize);
                        }}
                        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                          auditPageSize === size
                            ? 'bg-emerald-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                    <span className="text-sm text-gray-500">条</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fetchAuditLogs(auditPage - 1)}
                      disabled={auditPage <= 1 || auditLoading}
                      className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>
                    <span className="text-sm text-gray-600">
                      第 {auditPage} / {auditTotalPages} 页
                    </span>
                    <button
                      onClick={() => fetchAuditLogs(auditPage + 1)}
                      disabled={auditPage >= auditTotalPages || auditLoading}
                      className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => { if (!deleting) setDeleteTarget(null); }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-900/60 via-black/50 to-gray-900/60 backdrop-blur-sm transition-opacity" />

            <div
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-400 via-red-500 to-rose-500" />

              <div className="p-6 pt-7">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-gray-900">
                      确认删除{deleteTarget.type === 'user' ? '用户' : '案件'}
                    </h3>
                    <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
                      {deleteTarget.desc}
                    </p>
                  </div>
                </div>

                <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    删除后所有相关数据将无法找回，请确认您要执行此操作。
                  </p>
                </div>

                <div className="mt-6 flex gap-3 justify-end">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    disabled={deleting}
                    className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={deleting}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 rounded-xl transition-all shadow-lg shadow-red-500/25 hover:shadow-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {deleting ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        删除中...
                      </>
                    ) : (
                      '确认删除'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {editingUser && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditingUser(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-800 mb-4">编辑用户</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">用户名</label>
                  <input
                    type="text"
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">手机号</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">角色</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="user">普通用户</option>
                    <option value="admin">管理员</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-5">
                <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
                <button onClick={handleUpdateUser} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">保存</button>
              </div>
            </div>
          </div>
        )}

        {pwdTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { if (!pwdChanging) setPwdTarget(null); }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500" />

              <div className="p-6 pt-7">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-gray-900">修改用户密码</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      正在为用户「<span className="font-medium text-gray-700">{pwdTarget.username}</span>」修改登录密码
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1.5">管理员密码验证</label>
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="请输入您的管理员密码"
                        value={pwdForm.adminPassword}
                        onChange={(e) => setPwdForm({ ...pwdForm, adminPassword: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleChangePwd(); }}
                        className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                      />
                      <svg className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1.5">新密码</label>
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="至少6位，请设置新密码"
                        value={pwdForm.newPassword}
                        onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleChangePwd(); }}
                        className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                      />
                      <svg className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      修改他人密码前需验证您的管理员身份，以确保操作安全。
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex gap-3 justify-end">
                  <button
                    onClick={() => setPwdTarget(null)}
                    disabled={pwdChanging}
                    className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleChangePwd}
                    disabled={pwdChanging}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl transition-all shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {pwdChanging ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        修改中...
                      </>
                    ) : (
                      '确认修改'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
