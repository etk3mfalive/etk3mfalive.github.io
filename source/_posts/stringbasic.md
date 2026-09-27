---
title: 字符串常见用法及函数整理
date: 2026-03-25 17:41:00
updated: 2026-03-25 17:41:00
cover: /images/blog/stringbasic/d678981fb1f4e882.png
comments: true
---

## 前记
对字符串处理不是很感冒，遂找个坑自己埋了。
##读入输出

```
char s[10];
string str; 
int a[10];
int main(){
	//sizeof 表示总字节数 对于char数组即大小 
	//scanf("%s",s);//char[]类型 省略前后空格Tab等 不读其后空格 
	//cin.getline(s,sizeof(s)); //char[]类型 整行读入 
	//cin>>s; //同scanf 但是char[] string都能用 
	getline(cin,s);//string类型 
	//getchar();//不必多说 
	cout<<s[1];
	return 0;
} 
```
<!-- more -->

## 常见函数

### char[]

strlen() - 计算字符串长度

strcpy() - 复制字符串，包括结束符 '\0'。
e.g.	strcpy(str1, str2);

strcat() - 将源字符串追加到目标字符串的末尾。
e.g.	strcat(str1, str2);

strcmp() 比较两个字符串的内容：

若 string1 > string2，返回一个大于0的数。

若 string1 = string2，返回0。

若 string1 < string2，返回一个小于0的数。

int value = strcmp(str1, str2);

strstr() 在一个字符串中查找另一个字符串的第一次出现，返回指向该位置的指针。

char* ret = strstr(str1, str2);

strtok() - 分割字符串

strtok() 函数用于将字符串分割成多个子字符串。示例：
```
char arr1[] = "15145j@qq.com";
char arr2[100] = { 0 };
strcpy(arr2, arr1);
char sep[] = "@.";
char* ret = NULL;
for (ret = strtok(arr2, sep); ret != NULL; ret = strtok(NULL, sep)) {
printf("%s\n", ret); // 输出: 15145j qq com
}
```
