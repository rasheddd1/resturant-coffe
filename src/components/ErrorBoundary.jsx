import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('[Admin Dashboard]', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card card-pad page-error-state" role="alert">
        <div className="page-error-icon">⚠️</div>
        <h3>تعذر فتح القسم</h3>
        <p>حدث خطأ غير متوقع في هذه الصفحة. يمكنك إعادة المحاولة دون تسجيل الخروج.</p>
        <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>إعادة المحاولة</button>
      </div>
    );
  }
}
