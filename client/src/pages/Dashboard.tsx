import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { MapChart, PieChart } from 'echarts/charts';
import {
  TooltipComponent,
  VisualMapComponent,
  GeoComponent,
  LegendComponent,
  GraphicComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { DashboardStats } from '../types';
import { dashboardAPI } from '../api';

echarts.use([
  MapChart,
  PieChart,
  TooltipComponent,
  VisualMapComponent,
  GeoComponent,
  LegendComponent,
  GraphicComponent,
  CanvasRenderer,
]);

const CHINA_GEOJSON_URL =
  'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json';

function useAnimatedValue(target: number, duration: number = 800) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const fromRef = useRef<number>(0);

  useEffect(() => {
    fromRef.current = display;
    startRef.current = 0;
    const step = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(fromRef.current + (target - fromRef.current) * eased);
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}

function StatCard({
  title,
  value,
  icon,
  color,
  suffix,
}: {
  title: string;
  value: number;
  icon: string;
  color: string;
  suffix?: string;
}) {
  const animated = useAnimatedValue(value);

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl p-5 group hover:bg-white/[0.06] transition-all duration-500"
      style={{ boxShadow: `0 0 30px ${color}10, inset 0 1px 0 ${color}15` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-700"
        style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }}
      />
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-white/40 text-xs tracking-widest uppercase mb-2">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-white tabular-nums tracking-tight">
              {animated.toLocaleString()}
            </span>
            {suffix && <span className="text-white/30 text-sm">{suffix}</span>}
          </div>
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
          style={{ background: `${color}15`, color }}
        >
          {icon}
        </div>
      </div>
      <div
        className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-5 blur-xl"
        style={{ background: color }}
      />
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeStr, setTimeStr] = useState('');
  const [geoJson, setGeoJson] = useState<Record<string, unknown> | null>(null);
  const [mapRegistered, setMapRegistered] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await dashboardAPI.getStats();
      setStats(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    intervalRef.current = setInterval(fetchStats, 30000);
    return () => clearInterval(intervalRef.current);
  }, [fetchStats]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const y = now.getFullYear();
      const M = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      const w = weekdays[now.getDay()];
      setTimeStr(`${y}-${M}-${d} 星期${w} ${h}:${m}:${s}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (mapRegistered) return;
    fetch(CHINA_GEOJSON_URL)
      .then((r) => r.json())
      .then((json) => {
        echarts.registerMap('china', json);
        setGeoJson(json);
        setMapRegistered(true);
      })
      .catch(() => {});
  }, [mapRegistered]);

  const mapOption = stats && geoJson
    ? {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          backgroundColor: 'rgba(6,12,28,0.92)',
          borderColor: 'rgba(0,212,255,0.3)',
          borderWidth: 1,
          textStyle: { color: '#e2e8f0', fontSize: 13 },
          formatter: (params: { name: string; value?: number }) => {
            if (!params.value) {
              return `<strong>${params.name}</strong><br/>暂无案件数据`;
            }
            return `<strong>${params.name}</strong><br/>案件数：<span style="color:#00d4ff;font-weight:bold;font-size:16px;">${params.value}</span>`;
          },
        },
        visualMap: {
          min: 0,
          max: Math.max(...stats.province_distribution.map((d) => d.value), 1),
          text: ['高', '低'],
          realtime: false,
          calculable: true,
          inRange: {
            color: ['#0b1a3a', '#0d3b66', '#1a6b8a', '#00a8cc', '#00d4ff'],
          },
          textStyle: { color: '#94a3b8' },
          left: 16,
          bottom: 16,
        },
        geo: {
          map: 'china',
          roam: false,
          zoom: 1.16,
          center: [104.5, 36],
          label: { show: false },
          itemStyle: {
            areaColor: '#0b1a3a',
            borderColor: 'rgba(0,212,255,0.18)',
            borderWidth: 1,
            shadowColor: 'rgba(0,100,200,0.15)',
            shadowBlur: 12,
          },
          emphasis: {
            label: {
              show: true,
              color: '#00d4ff',
              fontSize: 13,
            },
            itemStyle: {
              areaColor: '#0d3b66',
              borderColor: '#00d4ff',
              borderWidth: 1.5,
              shadowColor: 'rgba(0,212,255,0.3)',
              shadowBlur: 20,
            },
          },
        },
        series: [
          {
            name: '案件地域分布',
            type: 'map',
            map: 'china',
            geoIndex: 0,
            data: stats.province_distribution,
          },
        ],
      }
    : null;

  const pieOption = stats
    ? {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          backgroundColor: 'rgba(6,12,28,0.92)',
          borderColor: 'rgba(0,212,255,0.3)',
          textStyle: { color: '#e2e8f0' },
          formatter: '{b}: {c} ({d}%)',
        },
        legend: {
          bottom: 4,
          textStyle: { color: '#94a3b8', fontSize: 11 },
          itemWidth: 10,
          itemHeight: 10,
          itemGap: 16,
        },
        series: [
          {
            name: '案件类型',
            type: 'pie',
            radius: ['52%', '78%'],
            center: ['50%', '48%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderColor: 'rgba(10,14,39,0.8)',
              borderWidth: 4,
              borderRadius: 4,
            },
            label: {
              show: true,
              position: 'outside',
              color: '#cbd5e1',
              fontSize: 11,
              formatter: '{b}\n{d}%',
            },
            labelLine: {
              lineStyle: { color: '#475569' },
            },
            emphasis: {
              label: { fontSize: 16, fontWeight: 'bold' },
              scaleSize: 8,
            },
            data: stats.case_type_distribution,
            color: ['#00d4ff', '#3b82f6', '#7c3aed', '#10b981', '#f59e0b'],
          },
        ],
      }
    : null;

  const totalCases = stats?.total_cases ?? 0;
  const regionCount = stats?.region_count ?? 0;

  return (
    <div className="fixed inset-0 bg-[#060c1c] text-white font-sans overflow-hidden select-none">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, #00d4ff 1px, transparent 1px),
            radial-gradient(circle at 75% 75%, #7c3aed 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div
        className="absolute top-0 left-0 right-0 h-px opacity-30 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, #00d4ff60, #7c3aed60, transparent)' }}
      />

      <div className="relative z-10 flex flex-col h-full p-5">
        <header className="flex items-center justify-between pb-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
              style={{ background: 'linear-gradient(135deg, #00d4ff20, #7c3aed20)', border: '1px solid rgba(0,212,255,0.2)' }}>
              ⚖
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-wider"
                style={{ background: 'linear-gradient(90deg, #00d4ff, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                粤省法 · 智能数据中台
              </h1>
              <p className="text-white/25 text-xs tracking-[0.2em]">GUANGDONG LEGAL AI DATA COMMAND CENTER</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-white/40 text-sm font-mono tracking-wider">{timeStr}</div>
            <button
              onClick={() => navigate('/workbench')}
              className="px-4 py-1.5 rounded-lg text-xs text-white/50 border border-white/10 hover:border-white/30 hover:text-white/80 transition-all duration-300"
            >
              ← 返回工作台
            </button>
          </div>
        </header>

        <div className="grid grid-cols-4 gap-4 mb-4 flex-shrink-0">
          <StatCard title="系统用户总数" value={stats?.total_users ?? 0} icon="👥" color="#00d4ff" suffix="人" />
          <StatCard title="案件总量" value={totalCases} icon="📋" color="#3b82f6" suffix="件" />
          <StatCard title="AI 办理中" value={stats?.handling ?? 0} icon="⚡" color="#f59e0b" suffix="件" />
          <StatCard title="人工处理中" value={stats?.processing ?? 0} icon="🔍" color="#7c3aed" suffix="件" />
        </div>

        <div className="grid grid-cols-4 gap-4 flex-1 min-h-0">
          <div className="col-span-3 relative rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm overflow-hidden"
            style={{ boxShadow: '0 0 40px rgba(0,212,255,0.05), inset 0 1px 0 rgba(255,255,255,0.03)' }}>
            <div className="absolute top-0 left-0 right-0 h-12 flex items-center px-5 border-b border-white/5 z-10">
              <span className="text-white/70 text-sm tracking-wider">📍 案件地域分布</span>
              <span className="ml-auto text-white/25 text-xs">覆盖 {regionCount} 个省份</span>
            </div>
            <div className="absolute inset-0 top-12">
              {loading && (
                <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                    <span className="text-white/30 text-sm">加载地图数据...</span>
                  </div>
                </div>
              )}
              {!loading && mapOption && (
                <ReactEChartsCore
                  echarts={echarts}
                  option={mapOption}
                  style={{ height: '100%', width: '100%' }}
                  opts={{ renderer: 'canvas' }}
                />
              )}
              {!loading && !mapOption && (
                <div className="flex items-center justify-center h-full text-white/30 text-sm">
                  地图数据加载中...
                </div>
              )}
            </div>
          </div>

          <div className="col-span-1 flex flex-col gap-4 min-h-0">
            <div className="flex-1 relative rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm overflow-hidden"
              style={{ boxShadow: '0 0 40px rgba(124,58,237,0.05), inset 0 1px 0 rgba(255,255,255,0.03)' }}>
              <div className="absolute top-0 left-0 right-0 h-12 flex items-center px-5 border-b border-white/5 z-10">
                <span className="text-white/70 text-sm tracking-wider">📊 案件类型分布</span>
              </div>
              <div className="absolute inset-0 top-12">
                {pieOption && (
                  <ReactEChartsCore
                    echarts={echarts}
                    option={pieOption}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                  />
                )}
              </div>
            </div>

            <div className="relative rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm p-5 overflow-hidden"
              style={{ boxShadow: '0 0 40px rgba(16,185,129,0.05), inset 0 1px 0 rgba(255,255,255,0.03)' }}>
              <div className="absolute inset-0 pointer-events-none">
                <div className="scan-line" />
              </div>
              <div className="relative z-10">
                <p className="text-white/40 text-xs tracking-widest uppercase mb-3">系统运行状态</p>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/50">待处理案件</span>
                    <span className="text-cyan-400 font-mono">{stats?.status_breakdown?.pending ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/50">已完成案件</span>
                    <span className="text-emerald-400 font-mono">{stats?.status_breakdown?.completed ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/50">完成率</span>
                    <span className="text-emerald-400 font-mono">
                      {totalCases > 0
                        ? `${Math.round(((stats?.status_breakdown?.completed ?? 0) / totalCases) * 100)}%`
                        : '0%'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-xs text-emerald-400/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981] animate-pulse" />
                  系统运行正常
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between pt-4 flex-shrink-0">
          <div className="flex items-center gap-3 text-white/20 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/40" />
            数据每 30 秒自动更新
          </div>
          <span className="text-white/15 text-xs">粤省法智能辅助办案系统 © 2026</span>
        </footer>
      </div>

      <style>{`
        .scan-line {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent);
          animation: scanMove 3s linear infinite;
          pointer-events: none;
        }
        @keyframes scanMove {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
