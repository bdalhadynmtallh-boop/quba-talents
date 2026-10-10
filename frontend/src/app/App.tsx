import { createBrowserRouter, RouterProvider, Link } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthProvider';
import { Layout } from '../components/layout/Layout';
import { HomePage } from '../pages/HomePage';
import { StudentsPage } from '../pages/StudentsPage';
import { StudentProfilePage } from '../pages/StudentProfilePage';
import { RegisterPage } from '../pages/RegisterPage';
import { LoginPage } from '../pages/LoginPage';
import { StatusPanel } from '../components/ui/StatusPanel';
const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <Layout />
      </AuthProvider>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'students', element: <StudentsPage /> },
      { path: 'students/:id', element: <StudentProfilePage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'login', element: <LoginPage /> },
      {
        path: '*',
        element: (
          <div className="container page">
            <StatusPanel
              title="الصفحة غير موجودة"
              action={
                <Link className="button" to="/">
                  العودة إلى الرئيسية
                </Link>
              }
            />
          </div>
        ),
      },
    ],
  },
]);
export function App() {
  return <RouterProvider router={router} />;
}
