$ErrorActionPreference = 'Stop'
$sourceRoot = 'C:\Users\rausa\OneDrive\Рабочий стол\CampusForge'
$standRoot = Join-Path $env:TEMP 'campusforge-independent-ui-audit-20261004'
New-Item -ItemType Directory -Force -Path "$standRoot\apps\web" | Out-Null
Copy-Item -LiteralPath "$sourceRoot\tsconfig.json" -Destination "$standRoot\tsconfig.json"
Copy-Item -LiteralPath "$sourceRoot\package.json" -Destination "$standRoot\package.json"
Get-ChildItem -LiteralPath "$sourceRoot\apps\web" -Force | Where-Object { $_.Name -notin @('node_modules','.next','.turbo') -and $_.Name -notlike '.env*' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination "$standRoot\apps\web" -Recurse -Force }
if (-not (Test-Path "$standRoot\node_modules")) { New-Item -ItemType Junction -Path "$standRoot\node_modules" -Target "$sourceRoot\node_modules" | Out-Null }
if (-not (Test-Path "$standRoot\apps\web\node_modules")) { New-Item -ItemType Junction -Path "$standRoot\apps\web\node_modules" -Target "$sourceRoot\apps\web\node_modules" | Out-Null }
$actionsRoot = "$standRoot\apps\web\src\server\actions"
Get-ChildItem -LiteralPath $actionsRoot -Filter '*.ts' | ForEach-Object {
  $contents = Get-Content -LiteralPath $_.FullName -Raw
  $names = [regex]::Matches($contents, 'export async function (\w+)') | ForEach-Object { $_.Groups[1].Value }
  $mockText = "'use server';`n" + (($names | ForEach-Object { "export async function $_(...args: unknown[]) { console.log('AUDIT_MOCK_ACTION $_'); await new Promise(r => setTimeout(r, 2000)); return {success:false,error:'Audit mock: no mutation was performed'}; }" }) -join "`n")
  Set-Content -LiteralPath $_.FullName -Value $mockText
}
Set-Content -LiteralPath "$actionsRoot\auth.ts" -Value "'use server'; export async function signInAction(...args: unknown[]){await new Promise(r=>setTimeout(r,300));return {success:true}}; export async function signUpAction(){return {success:false,error:'Audit mock'}};export async function completeOnboardingAction(){return {success:false,error:'Audit mock'}};"
Set-Content -LiteralPath "$standRoot\apps\web\src\middleware.ts" -Value "export const config = { matcher: [] }; export function middleware() {}"
Set-Content -LiteralPath "$standRoot\apps\web\src\lib\auth.ts" -Value "export async function auth() { return {user:{id:'audit-user-a',name:'Audit Alice',email:'alice@example.invalid'},expires:'2099-01-01'} }; export const handlers = {GET:async()=>Response.json({}),POST:async()=>Response.json({url:'/sign-in'})}; export async function signIn() {}; export async function signOut() {};"
Set-Content -LiteralPath "$standRoot\apps\web\src\server\queries\workspace.ts" -Value "const ws={id:'audit',name:'Audit Workspace',type:'PERSONAL',role:'OWNER',memberCount:1,taskCount:0,noteCount:0,documentCount:0}; export async function getUserWorkspaces(){return [ws]}; export async function getWorkspaceForUser(){return ws};"
Set-Content -LiteralPath "$standRoot\apps\web\src\app\api\workspaces\[workspaceId]\documents\upload\route.ts" -Value "export async function POST(){return Response.json({error:'Audit mock upload failure'},{status:503})}"
New-Item -ItemType Directory -Force -Path "$standRoot\apps\web\src\app\audit" | Out-Null
$auditRoute = @'
import {AppShell} from '@/components/layout/app-shell';
import {AssistantApp} from '@/components/assistant/assistant-app';
import {FlashcardViewer} from '@/components/flashcard/flashcard-viewer';
import {TaskList,TaskListSkeleton} from '@/components/task/task-list';
import {DocumentList,DocumentListSkeleton} from '@/components/document/document-list';
import {DocumentDetailView} from '@/components/document/document-detail-view';
const workspaces=[{id:'audit',name:'Audit Workspace',type:'PERSONAL',role:'OWNER'},{id:'audit-b',name:'Audit Workspace B',type:'TEAM',role:'MEMBER'}];
const date='2026-10-04T12:00:00Z';
export default function AuditPage({searchParams}:{searchParams:Record<string,string>}) {
const user={name:searchParams.user==='b'?'Audit Bob':'Audit Alice',email:searchParams.user==='b'?'bob@example.invalid':'alice@example.invalid'};
const fixtureTask={id:'audit-task',title:'Review isolated audit findings',description:'A fixture task with a due date and status',status:'IN_PROGRESS',priority:'HIGH',dueDate:date,assigneeId:null,assigneeName:null,createdAt:date,updatedAt:date};
const doc={id:'audit-document',filename:'Audit evidence.txt',mimeType:'text/plain',sizeBytes:1024,processingStatus:'COMPLETED',extractedText:'THE ACTUAL FILE CONTENT IS ONLY: TRUTH_MARKER_42',createdAt:date,updatedAt:date,hasSummary:true};
const summary={id:'audit-summary',content:'TRUTH_MARKER_42 real database summary',createdAt:date,updatedAt:date};
let view:React.ReactNode;
switch(searchParams.view){
case 'flashcards': view=<FlashcardViewer title="Audit fixture set" cards={[{front:'Question one',back:'Answer one'},{front:'Question two',back:'Answer two'}]}/>;break;
case 'tasks':view=<TaskList tasks={searchParams.state==='empty'?[]:[fixtureTask]} workspaceId="audit" members={[{id:'audit-user-a',name:'Audit Alice',email:'alice@example.invalid'}]}/>;break;
case 'documents':view=<DocumentList documents={searchParams.state==='empty'?[]:[doc]} workspaceId="audit"/>;break;
case 'document':view=<DocumentDetailView document={doc as any} summary={summary as any} summaryJob={null} flashcardSets={[]} flashcardJob={null} workspaceId="audit"/>;break;
case 'loading':view=<><TaskListSkeleton/><DocumentListSkeleton/></>;break;
default:view=<AssistantApp user={user}/>;
}
return <AppShell user={user} workspaces={workspaces}>{view}</AppShell>;
}
'@
Set-Content -LiteralPath "$standRoot\apps\web\src\app\audit\page.tsx" -Value $auditRoute
New-Item -ItemType Directory -Force -Path "$standRoot\apps\web\src\app\runtime-probe" | Out-Null
Set-Content -LiteralPath "$standRoot\apps\web\src\app\runtime-probe\page.tsx" -Value "'use client'; import React,{useState,useTransition} from 'react'; export default function RuntimeProbe(){const [pending,start]=useTransition();const [count,setCount]=useState(0);return <div><p data-version>{React.version}</p><button data-probe disabled={pending} onClick={()=>start(async()=>{await new Promise(r=>setTimeout(r,2000));setCount(x=>x+1)})}>{pending?'Pending':'Ready'}</button><output>{count}</output></div>}"
# Only a temporary copy is modified. No source .env is copied or loaded.
Write-Output $standRoot
