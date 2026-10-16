import React, { useRef } from 'react';
import {
  X,
  Volume2,
  Music,
  Save,
  Globe,
  Upload,
  Download,
  Github,
} from 'lucide-react';
import { GameSettings } from '../types';
import { SAVE_KEY } from '../utils/gameUtils';
import { parseImportSave } from '../features/save/saveCodec';
import { playSound } from '../utils/sound';
import dayjs from 'dayjs';
import { CAMPUS_THEME } from '../config/campusTheme';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: GameSettings;
  onUpdateSettings: (settings: Partial<GameSettings>) => void;
  onImportSave?: () => void;
}

const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImportSave = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 支持 .json 和 .txt 文件
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.json') && !fileName.endsWith('.txt')) {
      alert('请选择 .json 或 .txt 格式的存档文件！');
      return;
    }

    try {
      const text = await file.text();
      const saveData = parseImportSave(text);

      // 显示存档信息预览
      const playerName = saveData.player.name || '未知';
      const realm = saveData.player.realm || '未知';
      const timestamp = saveData.timestamp
        ? new Date(saveData.timestamp).toLocaleString('zh-CN')
        : '未知';

      // 确认导入
      if (
        !window.confirm(
          `确定要导入此存档吗？\n\n玩家名称: ${playerName}\n学阶: ${realm}\n保存时间: ${timestamp}\n\n当前存档将被替换，页面将自动刷新。`
        )
      ) {
        return;
      }

      // 保存到localStorage
      localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));

      // 提示并刷新页面
      alert('存档导入成功！页面即将刷新...');
      window.location.reload();
    } catch (error) {
      console.error('导入存档失败:', error);
      alert(
        `导入存档失败！\n错误信息: ${error instanceof Error ? error.message : '未知错误'}\n请检查文件格式是否正确。`
      );
    }

    // 清空文件输入，以便可以重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExportSave = () => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (!saved) {
        alert('没有找到存档数据！请先开始游戏。');
        return;
      }

      // 解析存档数据以获取玩家信息用于文件名
      let saveData;
      try {
        saveData = JSON.parse(saved);
      } catch {
        alert('存档数据损坏，无法导出！');
        return;
      }

      // 创建文件名
      const playerName = saveData.player?.name || 'player';
      const fileName = `lingshu-save-${playerName}-${dayjs().format('YYYY-MM-DD HH:mm:ss')}.json`;

      // 创建下载链接
      const blob = new Blob([saved], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert('存档导出成功！');
    } catch (error) {
      console.error('导出存档失败:', error);
      alert(
        `导出存档失败！\n错误信息: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  };

  return (
    <div
      className="fixed inset-0 paper-overlay flex items-end md:items-center justify-center z-50 p-0 md:p-4 touch-manipulation font-mono"
      onClick={onClose}
    >
      <div
        className="bg-npu-panel border-0 md:border border-npu-border w-full h-[80vh] md:h-auto md:max-w-md md:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-npu-bg border-b border-npu-border p-3 md:p-4 flex justify-between items-center flex-shrink-0">
          <h2 className="text-lg md:text-xl text-npu-code">设置</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-npu-dim active:text-npu-text min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* 音效设置 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Volume2 size={20} className="text-npu-dim" />
              <h3 className="font-bold text-npu-text">音效</h3>
            </div>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-npu-dim">启用音效</span>
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(e) =>
                    onUpdateSettings({ soundEnabled: e.target.checked })
                  }
                  className="w-5 h-5 accent-npu-code"
                />
              </label>
              {settings.soundEnabled && (
                <div>
                  <label className="block text-sm text-npu-dim mb-2">
                    音效音量: {settings.soundVolume}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.soundVolume}
                    onChange={(e) =>
                      onUpdateSettings({
                        soundVolume: parseInt(e.target.value),
                      })
                    }
                    className="w-full accent-npu-code"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => playSound('click')}
                      className="flex-1 px-2 py-1 text-xs border border-npu-border text-npu-dim hover:text-npu-text hover:border-npu-code rounded"
                    >
                      试听·点击
                    </button>
                    <button
                      onClick={() => playSound('levelup')}
                      className="flex-1 px-2 py-1 text-xs border border-npu-border text-npu-dim hover:text-npu-text hover:border-npu-code rounded"
                    >
                      试听·升级
                    </button>
                    <button
                      onClick={() => playSound('defeat')}
                      className="flex-1 px-2 py-1 text-xs border border-npu-border text-npu-dim hover:text-npu-text hover:border-npu-code rounded"
                    >
                      试听·失败
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 音乐设置 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Music size={20} className="text-npu-dim" />
              <h3 className="font-bold text-npu-text">音乐</h3>
            </div>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-npu-dim">启用音乐</span>
                <input
                  type="checkbox"
                  checked={settings.musicEnabled}
                  onChange={(e) =>
                    onUpdateSettings({ musicEnabled: e.target.checked })
                  }
                  className="w-5 h-5 accent-npu-code"
                />
              </label>
              {settings.musicEnabled && (
                <div>
                  <label className="block text-sm text-npu-dim mb-2">
                    音乐音量: {settings.musicVolume}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.musicVolume}
                    onChange={(e) =>
                      onUpdateSettings({
                        musicVolume: parseInt(e.target.value),
                      })
                    }
                    className="w-full accent-npu-code"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 游戏设置 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Save size={20} className="text-npu-dim" />
              <h3 className="font-bold text-npu-text">游戏</h3>
            </div>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-npu-dim">自动保存</span>
                <input
                  type="checkbox"
                  checked={settings.autoSave}
                  onChange={(e) =>
                    onUpdateSettings({ autoSave: e.target.checked })
                  }
                  className="w-5 h-5 accent-npu-code"
                />
              </label>
              <div>
                <label className="block text-sm text-npu-dim mb-2">
                  动画速度
                </label>
                <select
                  value={settings.animationSpeed}
                  onChange={(e) =>
                    onUpdateSettings({
                      animationSpeed: e.target
                        .value as GameSettings['animationSpeed'],
                    })
                  }
                  className="w-full bg-npu-bg border border-npu-border px-3 py-2 text-npu-text"
                >
                  <option value="slow">慢</option>
                  <option value="normal">正常</option>
                  <option value="fast">快</option>
                </select>
              </div>
            </div>
          </div>

          {/* 存档管理 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Save size={20} className="text-npu-dim" />
              <h3 className="font-bold text-npu-text">存档管理</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-npu-dim mb-2">
                  导出存档
                </label>
                <button
                  onClick={handleExportSave}
                  className="w-full bg-npu-bg hover:border-npu-code hover:text-npu-code text-npu-text border border-npu-border px-4 py-2 flex items-center justify-center transition-colors"
                >
                  <Download size={16} className="mr-2" />
                  导出当前存档 (.json)
                </button>
                <p className="text-xs text-npu-muted mt-2">
                  {'// 将当前存档导出为 JSON 文件，可用于备份或分享'}
                </p>
              </div>
              <div>
                <label className="block text-sm text-npu-dim mb-2">
                  导入存档
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.txt"
                  onChange={handleImportSave}
                  className="hidden"
                  id="import-save-input"
                />
                <label
                  htmlFor="import-save-input"
                  className="block w-full bg-npu-bg hover:border-npu-code hover:text-npu-code text-npu-text border border-npu-border px-4 py-2 text-center cursor-pointer transition-colors"
                >
                  <Upload size={16} className="inline mr-2" />
                  选择存档文件 (.json 或 .txt)
                </label>
                <p className="text-xs text-npu-muted mt-2">
                  {
                    '// 选择 .json 或 .txt 格式的存档文件，导入后将替换当前存档并刷新页面'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* 语言设置 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe size={20} className="text-npu-dim" />
              <h3 className="font-bold text-npu-text">语言</h3>
            </div>
            <select
              value={settings.language}
              onChange={(e) =>
                onUpdateSettings({
                  language: e.target.value as GameSettings['language'],
                })
              }
              className="w-full bg-npu-bg border border-npu-border px-3 py-2 text-npu-text"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* 关于 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Github size={20} className="text-npu-dim" />
              <h3 className="font-bold text-npu-text">关于</h3>
            </div>
            <div className="space-y-3">
              <a
                href="https://github.com/2822708/xiuxian-npu"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full bg-npu-bg hover:border-npu-code hover:text-npu-code text-npu-text border border-npu-border px-4 py-2 transition-colors"
              >
                <Github size={16} />
                <span>GitHub 仓库</span>
                <span className="ml-auto text-xs text-npu-muted">↗</span>
              </a>
              <p className="text-xs text-npu-muted">
                {CAMPUS_THEME.description}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
