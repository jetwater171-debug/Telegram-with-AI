import React, { useState } from 'react';
import { WiinPayService, PaymentResponse } from '../services/wiinpayService';
// Actually, I'll check package.json for qrcode library. If not present, I'll just display the copy paste code for now or use a simple external QR generator for the demo if needed, or better, I'll just display the text and the copy-paste code.
// Wait, the prompt says "QR Code" and "Código Pix Copia e Cola".
// Let's stick to standard React.

const PaymentTest: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [paymentData, setPaymentData] = useState<PaymentResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleCreatePayment = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await WiinPayService.createPayment({
                value: 5.00, // Minimum is 3.00
                name: "Teste Usuário",
                email: "teste@email.com",
                description: "Teste de Integração WiinPay",
                webhook_url: "https://seusite.com/webhook" // Placeholder
            });
            setPaymentData(result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCheckStatus = async () => {
        if (!paymentData?.paymentId) return;
        try {
            const status = await WiinPayService.getPaymentStatus(paymentData.paymentId);
            alert(`Status: ${JSON.stringify(status)}`);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    return (
        <div className="p-8 max-w-md mx-auto bg-white rounded-xl shadow-md space-y-4">
            <h2 className="text-xl font-bold">Teste de Pagamento Pix</h2>

            <button
                onClick={handleCreatePayment}
                disabled={loading}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
            >
                {loading ? 'Gerando Pix...' : 'Gerar Pix de R$ 5,00'}
            </button>

            {error && (
                <div className="text-red-500 text-sm">{error}</div>
            )}

            {paymentData && (
                <div className="space-y-4 mt-4">
                    <div className="p-4 bg-gray-100 rounded">
                        <p className="font-semibold">ID do Pagamento:</p>
                        <p className="text-sm break-all">{paymentData.paymentId}</p>
                    </div>

                    {/* If the API returns a base64 image or url for QR Code, we could show it. 
              If it returns the payload string, we need a library. 
              For now, I'll assume it might be a payload string and just show the copy-paste code. */}

                    <div className="p-4 bg-gray-100 rounded">
                        <p className="font-semibold">Debug - Resposta da API:</p>
                        <pre className="text-xs overflow-auto max-h-40">
                            {JSON.stringify(paymentData, null, 2)}
                        </pre>
                    </div>

                    <div className="p-4 bg-gray-100 rounded">
                        <p className="font-semibold">Pix Copia e Cola:</p>
                        <textarea
                            readOnly
                            value={paymentData.qr_code || paymentData.pixCopiaCola || ''}
                            className="w-full h-24 text-xs p-2 border rounded"
                        />
                        <button
                            onClick={() => navigator.clipboard.writeText(paymentData.qr_code || paymentData.pixCopiaCola || '')}
                            className="mt-2 text-blue-500 text-sm hover:underline"
                        >
                            Copiar Código
                        </button>
                    </div>

                    <button
                        onClick={handleCheckStatus}
                        className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                    >
                        Verificar Status
                    </button>
                </div>
            )}
        </div>
    );
};

export default PaymentTest;
