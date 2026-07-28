import './globals.css';
import HeaderNav from './components/HeaderNav';

export const metadata = {
  title: 'Prana Air Blog | Air Quality & Environmental Health Insights',
  description: 'Explore the latest articles, research, and tips on air quality monitoring, air pollution prevention, and environmental health insights from Prana Air.',
  metadataBase: new URL('http://localhost:3000'), // Replace with actual production domain when deployed
  openGraph: {
    title: 'Prana Air Blog',
    description: 'Explore insights and tips on air quality monitoring and pollution prevention.',
    siteName: 'Prana Air Blog',
    locale: 'en_US',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body>
        <div className="app-wrapper">
          <header className="main-header">
            <div className="header-container">
              <a href="/" className="logo">
                Prana Air <span className="logo-accent">Blog</span>
              </a>
              <HeaderNav />
            </div>
          </header>

          <main className="main-content">
            {children}
          </main>

          <footer className="main-footer">
            <div className="footer-container">
              <div className="footer-info">
                <h3>Prana Air</h3>
                <p>Empowering you to breathe clean air through advanced monitoring and purification technology.</p>
              </div>
              <div className="footer-copyright">
                <p>&copy; {new Date().getFullYear()} Prana Air. All rights reserved.</p>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
