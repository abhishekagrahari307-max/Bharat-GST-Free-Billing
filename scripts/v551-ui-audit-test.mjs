// v5.5.1 — Complete A-to-Z UI/UX & Layout Audit Verification Suite
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${passed}. ${name}`);
}

console.log('Running v5.5.1 Complete A-to-Z UI/UX & Layout Audit Tests…');

const appJsx = read('src/App.jsx');
const indexCss = read('src/index.css');
const pageHeaderJsx = read('src/components/PageHeader.jsx');
const pageBarSlotsJs = read('src/components/pageBarSlots.js');
const munimJsx = read('src/components/AutonomousMunimWidget.jsx');
const sidebarJsx = read('src/components/SidebarMenu.jsx');
const sosBtnJsx = read('src/components/SosHelpReviewButton.jsx');
const helpModalJsx = read('src/components/HelpDeskAndReviewModal.jsx');
const reportsWorkspaceJsx = read('src/components/ReportsWorkspace.jsx');
const dashboardJsx = read('src/components/Dashboard.jsx');
const settingsJsx = read('src/components/SettingsView.jsx');

test('Natural Full-Page Scrolling: Header, Sidebar & Settings Bar unstick cleanly without inner scroll traps', () => {
  assert.ok(indexCss.includes('height: auto !important;') && indexCss.includes('overflow: visible !important;'),
    '.app-layout must allow natural full-page height & overflow');
  assert.ok(indexCss.includes('.app-topbar') && indexCss.includes('position: static !important;'),
    '.app-topbar must scroll naturally with the page');
  assert.ok(indexCss.includes('.main-content') && indexCss.includes('overflow-y: visible !important;'),
    '.main-content must delegate vertical scrolling to the document');
  assert.ok(settingsJsx.includes("position: 'static'"),
    'SettingsView .settings-bar must use static positioning');
});

test('Universal Sidebar Toggle (☰): Collapses to 100% Full-Screen on Desktop & Toggles Drawer on Mobile', () => {
  assert.ok(appJsx.includes('sidebarCollapsed') && appJsx.includes('handleToggleSidebar'),
    'App.jsx must manage sidebarCollapsed state and handleToggleSidebar');
  assert.ok(appJsx.includes('window.innerWidth <= 860'),
    'handleToggleSidebar must switch between mobile drawer and desktop collapse at 860px');
  assert.ok(indexCss.includes('@media (max-width: 860px)') && pageBarSlotsJs.includes('(max-width: 860px)'),
    'CSS and fitPageBar breakpoint must match 860px');
  assert.ok(indexCss.includes('.app-layout.sidebar-collapsed > .sidebar') && indexCss.includes('margin-left: -268px !important;'),
    'Collapsed desktop sidebar must slide completely off-canvas so main content takes 100% width');
  assert.ok(indexCss.includes('.app-layout.sidebar-collapsed .settings-savebar'),
    'Settings savebar must expand to left: 0 when sidebar is collapsed');
});

test('Mobile Sidebar Auto-Closes Immediately Upon Clicking Any Navigation Link', () => {
  assert.ok(appJsx.includes('mobileSidebarOpen') && appJsx.includes('setMobileSidebarOpen'),
    'App.jsx must define mobileSidebarOpen / setMobileSidebarOpen');
  assert.ok(appJsx.includes('onPick={(item) => {\n              setMobileSidebarOpen(false);'),
    'SidebarMenu onPick must immediately call setMobileSidebarOpen(false)');
  assert.ok(appJsx.includes("e.target.closest('button, a')"),
    'closeNavAfterPick must close mobile drawer for both buttons and links');
});

test('Zero Page Title vs Search Button Overlap & Zero Duplicate Reports Heading', () => {
  assert.ok(pageHeaderJsx.includes('className="page-title-text"'),
    'PageHeader must wrap title text in .page-title-text for clean ellipsis truncation');
  assert.ok(appJsx.includes('className="header-left-cluster"') && appJsx.includes('className="header-right-cluster"'),
    'App.jsx topbar must separate left title cluster and right action cluster');
  assert.ok(indexCss.includes('.page-bar-head .page-title .page-title-text') && indexCss.includes('text-overflow: ellipsis;'),
    'CSS must truncate long titles cleanly before reaching search/action controls');
  assert.ok(!reportsWorkspaceJsx.includes('Reports, Accounting & CA Desk\n            </div>'),
    'ReportsWorkspace must not duplicate the PageHeader title');
});

test('Zero Duplicate "+ + New Bill" Buttons & Consolidated Single-Row Top Bar', () => {
  assert.ok(!appJsx.includes('<Plus size={15} /> + New Bill') && !appJsx.includes('+ <Plus'),
    'New Bill button must never render double plus (+ +)');
  assert.ok(appJsx.includes("['reports', 'filing', 'incometax', 'settings', 'support', 'cashbook'].includes(currentView)"),
    'Topbar New Bill CTA must only render on views without their own PageHeader primary CTA');
});

test('Zero SOS Button Redundancy & Unobstructed PWA Install Banner', () => {
  assert.ok(!appJsx.includes('SOS · Help, Dictionary & Review'),
    'Duplicate sidebar-footer SOS button must be removed');
  assert.ok(!dashboardJsx.includes('SOS Help & Review'),
    'Duplicate Dashboard quick-shortcut SOS button must be removed');
  assert.ok(sosBtnJsx.includes('data-sos-open={menuOpen ? \'1\' : \'0\'}'),
    'SosHelpReviewButton must expose data-sos-open state');
  assert.ok(indexCss.includes('.sos-floating-root:not([data-sos-open="1"])') && indexCss.includes('display: none !important;'),
    'Closed floating SOS pill must be hidden so it never covers the bottom-right PWA install banner');
  assert.ok(helpModalJsx.includes('onOpenGuide') && helpModalJsx.includes('onOpenShortcuts'),
    'HelpDeskAndReviewModal must provide direct access to User Guide and Keyboard Shortcuts');
});

test('Non-Clipping MSME 43B(h) "5d Overdue" Tag & Clean 268px Sidebar Labels', () => {
  assert.ok(munimJsx.includes('className="msme-alert-row"') && munimJsx.includes('className="msme-overdue-tag"'),
    'AutonomousMunimWidget must use .msme-alert-row and .msme-overdue-tag');
  assert.ok(indexCss.includes('.msme-overdue-tag') && indexCss.includes('flex-shrink: 0 !important;'),
    '.msme-overdue-tag must never shrink or clip');
  assert.ok(sidebarJsx.includes("label: 'Mobile ↔ PC Sync'") && sidebarJsx.includes("label: 'All New Functions'"),
    'SidebarMenu must use clean non-truncating Connect & Sync labels');
  assert.ok(indexCss.includes('width: 268px !important;'),
    'Desktop sidebar must use 268px width so all navigation labels fit cleanly');
});

console.log(`v5.5.1 Complete A-to-Z UI/UX & Layout Audit Tests: ${passed} passed, 0 failed`);
