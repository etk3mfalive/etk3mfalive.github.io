---
title: 中缀表达式难题
date: 2026-03-25 17:05:00
categories:
  - 代码实现
mathjax: true
---

# 02：中缀表达式的值

**总时间限制：**200ms
**内存限制：**1024kB
<!-- more -->

## 描述

人们熟悉的四则运算表达式称为中缀表达式，例如：

```
(23 + 34 * 45 / (5 + 6 + 7))
```

在程序设计语言中，可以利用栈的方法把中缀表达式转换成后缀表达式（又称逆波兰表示法），并最终变为计算机可以直接执行的指令，得到表达式的值。

给定一个中缀表达式，编写程序，利用栈的方法，计算表达式的值。

---

## 输入

* 第一行为测试数据的组数 N
* 接下来的 N 行，每行是一个中缀表达式

要求：

* 表达式中只含数字、四则运算符和圆括号
* 操作数都是正整数
* 数字和运算符、括号之间没有空格
* 表达式长度不超过 600

---

## 输出

对每一组测试数据输出一行，为表达式的值。

---

## 样例输入

```
3
3+5*8
(3+5)*8
(23+34*45/(5+6+7))
```

---
## 样例输出
```
43
64
108
```
## 解题思路

注意处理运算符号顺序

### 代码实现

```
#include <iostream>
#include <string.h>
#include <map>
using namespace std;
map <char,int> lev;
int num[1005],tn,tc,ans,T;
char ch[1005],s[1005];
void calc(){
	int x=num[tn-1],y=num[tn];
	if (ch[tc]=='+') ans=x+y;
	if (ch[tc]=='-') ans=x-y;
	if (ch[tc]=='*') ans=x*y;
	if (ch[tc]=='/') ans=x/y;
	tc--;tn--;
	num[tn]=ans;
}
void work(){
	scanf("%s",s);
	int n=strlen(s);
	tc=tn=0;
	for (int i=0;i<n;)
	if ('0'<=s[i]&&s[i]<='9'){
		int x=0;
		while (i<n&&'0'<=s[i]&&s[i]<='9'){
			x=x*10+s[i]-'0';
			++i;
		}
		num[++tn]=x; 
	}else{
		if (s[i]=='(') ch[++tc]=s[i];
		else if (s[i]==')'){
			while (tc&&ch[tc]!='(') calc();
			tc--;
		}else{
			while (tc&&lev[ch[tc]]>=lev[s[i]]&&ch[tc]!='(') calc();
			ch[++tc]=s[i];
		}
		++i;
	}
	while (tc) calc();
	printf("%d\n",num[tn]);
}
int main(){
	scanf("%d",&T);
	lev['+']=lev['-']=1,lev['*']=lev['/']=2;
	while (T--) work(); 
	return 0;
} 
```


## 	03: 布尔表达式
>输入一个布尔表达式，请你输出它的真假值。
比如：( V | V ) & F & ( F | V )
V表示true，F表示false，&表示与，|表示或，!表示非。
上式的结果是F

### 样例输入
```
( V | V ) & F & ( F| V)
!V | V & V & !F & (F | V ) & (!F | F | !V & V)
(F&F|V|!V&!F&!(F|F&V))
```



---
# 03：布尔表达式

**总时间限制：**1000ms
**内存限制：**65536kB

## 描述

输入一个布尔表达式，请你输出它的真假值。

例如：

```
( V | V ) & F & ( F | V )
```

* V 表示 true
* F 表示 false
* & 表示与
* | 表示或
* ! 表示非

上式的结果是 `F`


## 输入

输入包含多行，每行一个布尔表达式，表达式中可以有空格，总长度不超过 1000。

## 输出

对每行输入，如果表达式为真，输出 `"V"`，否则输出 `"F"`。

## 样例输入
```
( V | V ) & F & ( F | V )
!V | V & V & (F & (F | V)) & (!F | F | !V & V)
(F&F|V)!V&!F&!(F|F&V)
```

## 样例输出
```
F
V
V
```
---

## 解题思路
注意$!$的特殊性$(!!F)$

```
#include <iostream>
#include <string.h>
#include <map>
using namespace std;
map<char,int> lev;
bool val[1005];
char s[1005],ch[1005];
int tc,tv;
void calc(){
	bool x=val[tv-1],y=val[tv],ans;
	if (ch[tc]=='!'){
		tc--;
		val[tv]=!val[tv];
		return;
	}
	if (ch[tc]=='&') ans=x&&y;
	else ans=x||y;
	tv--,tc--;
	val[tv]=ans;
}
int main(){
	lev['!']=3,lev['&']=2,lev['|']=1;
	while (fgets(s,sizeof(s),stdin)){
		int n=strlen(s);
		tc=tv=0;
		if (s[n-1]=='\n') s[n-1]='\0',n--; 
		for (int i=0;i<n;++i)
		if (s[i]=='V'||s[i]=='F'){
			val[++tv]=s[i]=='V';
		}else{
			if (s[i]=='(') ch[++tc]=s[i];
			else if (s[i]==')'){
				while (tc&&ch[tc]!='(') calc();
				--tc;
			}else if (s[i]!=' '){
				while (tc&&ch[tc]!='('&&(lev[ch[tc]]>lev[s[i]]||lev[ch[tc]]==lev[s[i]]&&s[i]!='!')) calc();
				ch[++tc]=s[i];
			}
		}
		while (tc) calc();
		printf(val[tv]?"V\n":"F\n");
	} 
	return 0;
} 

```







