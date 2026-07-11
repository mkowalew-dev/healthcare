import { resourceCategories, Resource } from '../data'
import { FileText, FileSpreadsheet, Presentation, Link as LinkIcon, Monitor, Users, Shield } from 'lucide-react'

const ICON_MAP: Record<string, React.ReactNode> = {
  Users:       <Users size={18} />,
  Monitor:     <Monitor size={18} />,
  Stethoscope: <FileText size={18} />,
  Shield:      <Shield size={18} />,
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  PDF:  <FileText      size={14} className="text-cisco-red"    />,
  DOCX: <FileText      size={14} className="text-cisco-blue"   />,
  XLSX: <FileSpreadsheet size={14} className="text-cisco-green" />,
  PPTX: <Presentation  size={14} className="text-cisco-orange" />,
  LINK: <LinkIcon      size={14} className="text-cisco-blue"   />,
}

const TYPE_LABEL: Record<string, string> = {
  PDF:  'bg-red-50 text-red-600',
  DOCX: 'bg-blue-50 text-blue-600',
  XLSX: 'bg-green-50 text-green-700',
  PPTX: 'bg-amber-50 text-amber-600',
  LINK: 'bg-cyan-50 text-cyan-700',
}

function ResourceRow({ r }: { r: Resource }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-cisco-light-gray transition-colors cursor-pointer rounded-lg group">
      <span>{TYPE_ICONS[r.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 group-hover:text-cisco-blue transition-colors truncate">{r.name}</p>
        <p className="text-xs text-gray-400">Updated {r.updated}{r.size ? ` · ${r.size}` : ''}</p>
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded flex-shrink-0 ${TYPE_LABEL[r.type] ?? 'bg-gray-100 text-gray-600'}`}>
        {r.type}
      </span>
    </div>
  )
}

export default function Resources() {
  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="section-title">Resources</h1>
        <p className="text-gray-500 text-sm -mt-3">Policies, guides, and tools for CareConnect employees.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {resourceCategories.map((cat) => (
          <div key={cat.id} className="card overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                   style={{ backgroundColor: cat.color }}>
                {ICON_MAP[cat.icon]}
              </div>
              <h2 className="font-semibold text-gray-900 text-sm">{cat.label}</h2>
              <span className="ml-auto text-xs text-gray-400">{cat.items.length} items</span>
            </div>
            <div className="p-2">
              {cat.items.map((r) => <ResourceRow key={r.id} r={r} />)}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center pb-2">
        For assistance locating a document, contact the relevant department or IT Help Desk at ext. 4357.
      </p>
    </div>
  )
}
