import { Component, type ReactNode } from 'react';

/** Si algo revienta, muestra un aviso amable en lugar de una pantalla en blanco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center-screen">
        <div className="panel">
          <h2 style={{ margin: 0 }}>¡Ups! Algo se ha roto</h2>
          <p style={{ margin: 0 }}>Recarga la página para volver al Rincón de Juegos. Si estabas en una sala, podrás entrar otra vez con el mismo enlace.</p>
          <button className="btn primary" onClick={() => location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
