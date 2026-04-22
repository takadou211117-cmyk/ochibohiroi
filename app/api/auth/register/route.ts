import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, age, grade, school, department } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "メールアドレスとパスワードは必須です" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "このメールアドレスは既に使用されています" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || null,
        age: age ? parseInt(age) : null,
        grade: grade ? parseInt(grade) : null,
        school: school || null,
        department: department || null,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 });
  }
}
