import { createHashRouter, RouterProvider } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import News from './pages/News'
import Stories from './pages/Stories'
import Performance from './pages/Performance'
import Resources from './pages/Resources'
import Directory from './pages/Directory'
import Events from './pages/Events'

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true,         element: <Dashboard /> },
      { path: 'news',        element: <News /> },
      { path: 'stories',     element: <Stories /> },
      { path: 'performance', element: <Performance /> },
      { path: 'resources',   element: <Resources /> },
      { path: 'directory',   element: <Directory /> },
      { path: 'events',      element: <Events /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
