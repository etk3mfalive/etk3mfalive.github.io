---
title: KMP算法回顾
date: 2026-03-24 19:50:00
updated: 2026-03-24 19:50:00
categories:
  - 代码实现
description: 字符串处理，kmp回顾
cover: /images/blog/kmpbasic/d678981fb1f4e882.png
mathjax: true
comments: true
---

## 模式串匹配

模式串匹配，就是给定一个需要处理的文本串（理论上应该很长）和一个需要在文本串中搜索的模式串（理论上长度应该远小于文本串），查询在该文本串中，给出的模式串的出现有无、次数、位置等。

## 具体步骤

构建$kmp$数组，其中$kmp[i]$表示$s$中非$s$子串$t$使得$t$既是$s$的前缀又是$s$的后缀。

其中第一个循环j表示最大的符合条件的前缀位置（1~lb）

第二个循环找到符合$b[j]==a[i]$的最大 j（找不到自然为0）

## 代码实现
```
#include <iostream>
#include <string.h>
using namespace std;
const int N=1e6+10;
char a[N],b[N];
int kmp[N];
int main(){
	scanf("%s",a+1);
	scanf("%s",b+1);
	int la=strlen(a+1),lb=strlen(b+1);
	int j=0;
	for (int i=2;i<=lb;++i){
		while (j&&b[j+1]!=b[i]) j=kmp[j];
		if (b[j+1]==b[i]) j++;
		kmp[i]=j;
	} 
	j=0;
	for (int i=1;i<=la;++i){
		while (j&&b[j+1]!=a[i]) j=kmp[j];
		if (b[j+1]==a[i]) j++;
		if (j==lb){
			printf("%d\n",i-lb+1);
			j=kmp[j];
		}
	}
	for (int i=1;i<=lb;++i) printf("%d ",kmp[i]);
	return 0;
} 
```

kmp最重要的还是border应用吧.

## T1字符串的周期

>一个字符串的周期是指它的某个前缀，且通过反复拼接这个前缀最终能够得到整个字符串，其中最后一次拼接可以只是一部分。
例如字符串 abcabca 的周期可以是 abc, abcabc 和 abcabca。
给定一个字符串，请计算它的所有周期的长度。

### 解题思路
实际上这是一个类似于t为周期的循环块，即只需$s[1\sim n-t+1]$与$s[t\sim n]$相同。（大小为$n-t$）
那么这与$border$块怎么有关呢？发现$n-t$实际为$border$大小，最大为$kmp[n]$，然后依次为$s[1~kmp[n]]$的$border$块。
递归可得$kmp[n],kmp[kmp[n]]...$

### 代码实现

```
#include <iostream>
#include <string.h>
using namespace std;
const int N=1e6+10;
char s[N];
int kmp[N],ans[N],num;
bool check(int tail,int t){
	if (tail==t||t==0) return true;
	if (tail<t) return false;
	return check(kmp[tail],t);
}
int main(){
	scanf("%s",s+1);
	int n=strlen(s+1);
	int j=0;
	for (int i=2;i<=n;++i){
		while (j&&s[j+1]!=s[i]) j=kmp[j];
		if (s[j+1]==s[i]) j++;
		kmp[i]=j;
	}
	int x=n;
	while (x) x=kmp[x],ans[++num]=x;
	for (int i=1;i<=num;++i) printf("%d ",n-ans[i]);
	return 0;
} 
```


