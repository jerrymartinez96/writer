import React from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { LogIn, Sparkles, BookOpen } from 'lucide-react';
import { useToast } from './Toast';

const Login = () => {
    const toast = useToast();
    const handleLogin = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Login failed:", error);
            toast.error("Error al iniciar sesión. Por favor, intenta de nuevo.");
        }
    };

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[var(--bg-app)] overflow-hidden">
            {/* Animated Background Decor */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>

            <div className="relative w-full max-w-md p-8 bg-[var(--bg-editor)] border border-[var(--border-main)] rounded-3xl shadow-2xl animate-in zoom-in-95 duration-500">
                <div className="flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-600/20 transform -rotate-6">
                        <BookOpen size={40} className="text-white" />
                    </div>

                    <h1 className="text-4xl font-black font-serif text-[var(--text-main)] mb-3 tracking-tight">
                        LivingWriter <span className="text-indigo-600">AI</span>
                    </h1>
                    
                    <p className="text-[var(--text-muted)] text-lg mb-10 max-w-xs font-medium">
                        Tu santuario de escritura inteligente y colaborativa.
                    </p>

                    <button
                        onClick={handleLogin}
                        className="group relative w-full py-4 px-6 bg-white border border-gray-200 hover:border-indigo-600 transition-all duration-300 rounded-2xl flex items-center  justify-center gap-3 shadow-sm hover:shadow-md active:scale-[0.98]"
                    >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
                        <span className="text-gray-700 font-bold text-lg">Continuar con Google</span>
                    </button>

                    <div className="mt-8 flex items-center gap-2 text-indigo-500/80">
                        <Sparkles size={16} />
                        <span className="text-[10px] uppercase font-black tracking-widest">IA Integrada & Nube Sincronizada</span>
                    </div>

                    <p className="mt-12 text-[var(--text-muted)] text-xs font-medium">
                        Al continuar, aceptas que LivingWriter AI guardará tu obra de forma segura en la nube.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
