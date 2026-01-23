import { Link } from "react-router-dom";

export default function MainPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900 transition-colors">
      <div className="bg-white dark:bg-gray-800 text-black dark:text-white p-8 space-y-6 rounded shadow-md max-w-md w-full text-center">
        <h1 className="text-3xl font-bold">🚀 Welcome to Cosmos Web App!</h1>
        <p className="text-gray-600 dark:text-gray-300">You can navigate to the following pages:</p>

        <ul className="list-disc list-inside space-y-2 text-left">
          <li>
            <Link to="/app" className="text-blue-600 dark:text-blue-400 underline">
              🧩 Multi-chain Wallet Page
            </Link>
          </li>
          <li>
            <Link to="/neutron-testnet" className="text-blue-600 dark:text-blue-400 underline">
              🧠 Neutron Testnet Smart Contract Page
            </Link>
          </li>
          <li>
            <Link to="/qr" className="text-blue-600 dark:text-blue-400 underline">
              📲 QR Code Generator
            </Link>
          </li>
          <li>
            <Link to="/nft-list" className="text-blue-600 dark:text-blue-400 underline">
              🧾 View Owned NFTs
            </Link>
          </li>

          <li>
            <Link to="/visit-cert" className="text-blue-600 dark:text-blue-400 underline">
              🏪 Visit Certification Page
            </Link>
          </li>
          <li>
            <Link to="/review" className="text-blue-600 dark:text-blue-400 underline">
              📝 Review Submission Page
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
// import { Link } from "react-router-dom";

// export default function MainPage() {
//   return (
//     <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900 transition-colors">
//       <div className="bg-white dark:bg-gray-800 text-black dark:text-white p-8 space-y-6 rounded shadow-md max-w-md w-full text-center">
//         <h1 className="text-3xl font-bold">🚀 Cosmos Web アプリへようこそ！</h1>
//         <p className="text-gray-600 dark:text-gray-300">以下のページに移動できます：</p>

//         <ul className="list-disc list-inside space-y-2 text-left">
//           <li>
//             <Link to="/app" className="text-blue-600 dark:text-blue-400 underline">
//               🧩 マルチチェーンウォレットページ / Wallet Page
//             </Link>
//           </li>
//           <li>
//             <Link to="/neutron-testnet" className="text-blue-600 dark:text-blue-400 underline">
//               🧠 Neutron Testnet コントラクトページ / Smart Contract Page
//             </Link>
//           </li>
//           <li>
//             <Link to="/qr" className="text-blue-600 dark:text-blue-400 underline">
//               📲 QRコード生成ページへ
//             </Link>
//           </li>
//           <li>
//             <Link to="/nft-list" className="text-blue-600 dark:text-blue-400 underline">
//             🧾 所有NFT一覧を見る
//             </Link>
//           </li>

//           <li>
//             <Link to="/visit-cert" className="text-blue-600 dark:text-blue-400 underline">
//               🏪 来店証明ページ / Visit Certification
//             </Link>
//           </li>
//           <li>
//             <Link to="/review" className="text-blue-600 dark:text-blue-400 underline">
//               📝 レビュー投稿ページ / Review Page
//             </Link>
//           </li>
//         </ul>
//       </div>
//     </div>
//   );
// }
