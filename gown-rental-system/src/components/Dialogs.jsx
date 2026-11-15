import { useEffect, useState } from 'react';
import './Dialogs.css';

/* =========================================================
   Nice replacements for window.confirm() and alert().

   import { askConfirm, showAlert, DialogHost } from '../components/Dialogs';

   if (!(await askConfirm('Delete this record?'))) return;   // inside an async function
   showAlert('Please enter a name.');                         // no await needed

   Put <DialogHost /> once in the page (anywhere in the JSX).
========================================================= */

let hosts = [];          // mounted <DialogHost/> setters, only the first one renders
let queue = [];          // dialogs waiting to be shown
let current = null;

const emit = () => hosts.forEach(h => h(current));
const next = () => { current = queue.shift() || null; emit(); };
const push = (d) => new Promise(resolve => {
  queue.push({ ...d, resolve });
  if (!current) next();
});

const guessTone = (msg, fallback) => {
  const m = String(msg);
  if (/^\s*(error|stock update error)|run .*\.sql/i.test(m)) return 'error';
  if (/was already paid|cannot be undone/i.test(m)) return 'danger';
  return fallback;
};

export const askConfirm = (message, opts = {}) => {
  const isDelete = /^\s*delete\b/i.test(message);
  return push({
    kind: 'confirm',
    message,
    title: opts.title || (isDelete ? 'Delete?' : 'Please confirm'),
    tone: opts.tone || (isDelete ? 'danger' : 'gold'),
    confirmText: opts.confirmText || (isDelete ? 'Yes, delete' : 'Yes, continue'),
    cancelText: opts.cancelText || 'Cancel',
  });
};

export const showAlert = (message, opts = {}) => {
  const tone = opts.tone || guessTone(message, 'warn');
  return push({
    kind: 'alert',
    message,
    tone,
    title: opts.title || (tone === 'error' ? 'Something went wrong' : tone === 'info' ? 'Heads up' : 'Please check'),
    confirmText: opts.confirmText || 'OK',
  });
};

const ICON = { danger: '🗑️', error: '⚠️', warn: '✋', info: 'ℹ️', gold: '❓', green: '✓' };

export const DialogHost = () => {
  const [dlg, setDlg] = useState(current);
  const [isMain, setIsMain] = useState(false);

  useEffect(() => {
    hosts.push(setDlg);
    setIsMain(hosts[0] === setDlg);
    setDlg(current);
    return () => { hosts = hosts.filter(h => h !== setDlg); };
  }, []);

  const close = (result) => {
    if (!current) return;
    const r = current.resolve;
    r(current.kind === 'confirm' ? result : undefined);
    next();
  };

  useEffect(() => {
    if (!dlg || !isMain) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dlg, isMain]);

  if (!dlg || !isMain) return null;
  const tone = dlg.tone;
  const lines = String(dlg.message).split('\n');

  return (
    <div className="dlg-overlay" onClick={() => close(false)} role="presentation">
      <div className={`dlg-box dlg-${tone}`} role="alertdialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="dlg-icon">{ICON[tone] || '❓'}</div>
        <h3 className="dlg-title">{dlg.title}</h3>
        <div className="dlg-msg">
          {lines.map((l, i) => (l.trim() === '' ? <br key={i} /> : <p key={i}>{l}</p>))}
        </div>
        <div className="dlg-actions">
          {dlg.kind === 'confirm' && (
            <button className="dlg-btn dlg-cancel" onClick={() => close(false)}>{dlg.cancelText}</button>
          )}
          <button className={`dlg-btn dlg-ok dlg-ok-${tone}`} autoFocus onClick={() => close(true)}>{dlg.confirmText}</button>
        </div>
      </div>
    </div>
  );
};

export default DialogHost;