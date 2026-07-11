import { useState } from 'react'
import { stories, Story } from '../data'
import { Clock, ChevronLeft } from 'lucide-react'

const CATEGORIES = ['All', 'Innovation', 'Culture', 'Community', 'Awards', 'Clinical'] as const

const CAT_COLORS: Record<string, string> = {
  Innovation: '#049FD9', Culture: '#6EBE4A', Community: '#1D4289',
  Awards: '#FBAB18', Clinical: '#6EBE4A',
}

export default function Stories() {
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState<Story | null>(null)

  const filtered  = stories.filter((s) => category === 'All' || s.category === category)
  const featured  = stories.find((s) => s.featured)

  if (selected) return <StoryDetail story={selected} onBack={() => setSelected(null)} />

  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="section-title">Company Stories</h1>
        <p className="text-gray-500 text-sm -mt-3">The people, innovations, and moments that define CareConnect.</p>
      </div>

      {featured && category === 'All' && (
        <button
          onClick={() => setSelected(featured)}
          className="w-full text-left rounded-xl overflow-hidden shadow-card hover:shadow-card-hover transition-shadow cursor-pointer group"
          style={{ background: `linear-gradient(135deg, ${featured.imageColor}dd, ${featured.imageColor})` }}
        >
          <div className="px-8 py-9">
            <span className="inline-flex items-center bg-white/20 text-white text-xs font-medium px-2.5 py-0.5 rounded mb-4">
              Featured Story
            </span>
            <h2 className="font-semibold text-white text-xl mb-2 max-w-2xl group-hover:underline underline-offset-2 leading-snug">
              {featured.title}
            </h2>
            <p className="text-white/75 text-sm leading-relaxed max-w-xl">{featured.excerpt}</p>
            <p className="text-white/50 text-xs mt-4">{featured.date} · {featured.author} · {featured.readMinutes} min read</p>
          </div>
        </button>
      )}

      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
                    ${category === c ? 'text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-cisco-blue/40'}`}
                  style={category === c ? { backgroundColor: CAT_COLORS[c] ?? '#049FD9' } : {}}>
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filtered.map((s) => (
          <button key={s.id} onClick={() => setSelected(s)}
                  className="card text-left cursor-pointer group overflow-hidden hover:shadow-card-hover transition-shadow">
            <div className="h-28 flex items-center justify-center text-white"
                 style={{ backgroundColor: s.imageColor }}>
              <span className="opacity-40 uppercase tracking-widest text-[10px]">{s.category}</span>
            </div>
            <div className="p-4">
              <span className="badge" style={{ backgroundColor: CAT_COLORS[s.category] ?? '#58585B' }}>{s.category}</span>
              <h3 className="text-sm font-medium text-gray-800 mt-2 mb-1 leading-snug group-hover:text-cisco-blue transition-colors line-clamp-2">{s.title}</h3>
              <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">{s.excerpt}</p>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock size={11} /> {s.readMinutes} min · {s.date}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function StoryDetail({ story, onBack }: { story: Story; onBack: () => void }) {
  const catColor = CAT_COLORS[story.category] ?? '#049FD9'
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-cisco-blue hover:underline cursor-pointer">
        <ChevronLeft size={16} /> Back to Stories
      </button>
      <div className="h-48 rounded-xl flex items-center justify-center text-white"
           style={{ backgroundColor: story.imageColor }}>
        <span className="text-2xl font-semibold opacity-40">{story.category}</span>
      </div>
      <div>
        <span className="badge" style={{ backgroundColor: catColor }}>{story.category}</span>
        <h1 className="font-semibold text-gray-900 text-2xl mt-3 mb-2 leading-snug">{story.title}</h1>
        <div className="flex items-center gap-3 text-sm text-gray-500 mb-6">
          <span>{story.author}</span><span>·</span>
          <span>{story.authorTitle}</span><span>·</span>
          <span>{story.date}</span><span>·</span>
          <span className="flex items-center gap-1"><Clock size={13} /> {story.readMinutes} min</span>
        </div>
        <p className="text-base text-gray-600 font-medium leading-relaxed italic mb-6 border-l-4 pl-4"
           style={{ borderColor: catColor }}>
          {story.excerpt}
        </p>
        <p className="text-base text-gray-700 leading-relaxed">{story.body}</p>
      </div>
    </div>
  )
}
