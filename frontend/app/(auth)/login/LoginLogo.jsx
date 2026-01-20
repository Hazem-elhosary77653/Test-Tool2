// ملاحظة: يجب نقل ملف bat-logo.png إلى مجلد frontend/public ليظهر الشعار بشكل صحيح
import Image from 'next/image';

export function LoginLogo() {
  return (
    <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-4 border border-[var(--color-accent)]">
      <Image src="/bat-logo.png" alt="BAT Logo" width={40} height={40} />
    </div>
  );
}
